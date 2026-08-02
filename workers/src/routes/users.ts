import { requireAuth } from '../lib/auth'
import { readJson, normalizeEmail } from '../lib/request'
import { fail, ok } from '../lib/response'
import type { RouteHandler } from '../lib/router'
import type { Env } from '../types'

interface ProfileBody {
  pseudo?: string
  famileo_email?: string
  famileo_name?: string
  famileo_password?: string
  avatar_url?: string
  avatar_file_id?: string
  avatar?: string // base64 image data, always read/written back as image/jpeg (see ProfileContext.tsx)
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

// Avatars are stored in R2 (env.FILES), the same bucket/convention already
// used for article images (see uploadArticleImageToR2 in articles.ts) -
// avatar_file_id holds the R2 key, avatar_url an 'r2:{key}' marker so any
// future direct-link usage can tell it apart from a Drive file URL.
async function uploadAvatarToR2(env: Env, email: string, avatarBase64: string) {
  const safeEmail = normalizeEmail(email).replace(/[^a-z0-9._-]/g, '_')
  const key = `avatars/${safeEmail}/${Date.now()}.jpg`
  await env.FILES.put(key, base64ToUint8Array(avatarBase64), {
    httpMetadata: { contentType: 'image/jpeg' },
  })
  return { key, url: `r2:${key}` }
}

async function getUserByEmail(db: D1Database, email: string) {
  return db.prepare(
    `select email, pseudo, famileo_email, famileo_name, famileo_password_enc,
            avatar_url, avatar_file_id, status, created_at as date_created, updated_at as date_updated
       from users
      where lower(email) = ?1
      limit 1`
  )
    .bind(normalizeEmail(email))
    .first<{
      email: string
      pseudo: string | null
      famileo_email: string | null
      famileo_name: string | null
      famileo_password_enc: string | null
      avatar_url: string | null
      avatar_file_id: string | null
      status: string | null
      date_created: string | null
      date_updated: string | null
    }>()
}

async function loadAvatarBase64(env: Env, avatarFileId: string | null | undefined): Promise<string> {
  if (!avatarFileId) return ''
  try {
    const object = await env.FILES.get(avatarFileId)
    if (!object) return ''
    return arrayBufferToBase64(await object.arrayBuffer())
  } catch {
    return ''
  }
}

async function toProfile(env: Env, user: Awaited<ReturnType<typeof getUserByEmail>> | null, email: string) {
  if (!user) {
    return {
      email,
      pseudo: email.split('@')[0],
      famileo_email: '',
      famileo_name: '',
      famileo_password_set: false,
      avatar_url: '',
      avatar_file_id: '',
      avatar_base64: '',
    }
  }

  return {
    email: user.email,
    pseudo: user.pseudo || user.email.split('@')[0],
    famileo_email: user.famileo_email || '',
    famileo_name: user.famileo_name || '',
    famileo_password_set: !!user.famileo_password_enc,
    avatar_url: user.avatar_url || '',
    avatar_file_id: user.avatar_file_id || '',
    avatar_base64: await loadAvatarBase64(env, user.avatar_file_id),
  }
}

export const usersListHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  const result = await context.env.DB.prepare(
    `select email, pseudo, famileo_email, famileo_name,
            case when famileo_password_enc is not null and famileo_password_enc != '' then 1 else 0 end as famileo_password_set,
            avatar_url, avatar_file_id, status, created_at as date_created, updated_at as date_updated
       from users
      order by created_at asc`
  ).all<Record<string, unknown>>()

  const users = (result.results || []).map((row) => ({
    ...row,
    famileo_password_set: !!row.famileo_password_set,
  }))

  return ok({ users })
}

export const profileGetHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  const user = await getUserByEmail(context.env.DB, auth.user.email)
  return ok(await toProfile(context.env, user, auth.user.email))
}

export const profileSaveHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  const body = await readJson<ProfileBody>(request)
  const email = auth.user.email
  const now = new Date().toISOString()
  const existing = await getUserByEmail(context.env.DB, email)
  const pseudo = body.pseudo || existing?.pseudo || email.split('@')[0]
  const famileoEmail = body.famileo_email || ''
  const famileoName = body.famileo_name || ''
  let avatarUrl = body.avatar_url !== undefined ? body.avatar_url : existing?.avatar_url || ''
  let avatarFileId = body.avatar_file_id !== undefined ? body.avatar_file_id : existing?.avatar_file_id || ''
  if (body.avatar) {
    const uploaded = await uploadAvatarToR2(context.env, email, body.avatar)
    avatarUrl = uploaded.url
    avatarFileId = uploaded.key
  }
  const famileoPasswordEnc = body.famileo_password
    ? '__PREPARATION_ONLY__'
    : existing?.famileo_password_enc || ''

  await context.env.DB.prepare(
    `insert into users (
       id, email, pseudo, status, famileo_email, famileo_name, famileo_password_enc,
       avatar_url, avatar_file_id, created_at, updated_at
     ) values (?1, ?2, ?3, 'ACTIVE', ?4, ?5, ?6, ?7, ?8, ?9, ?10)
     on conflict(email) do update set
       pseudo = excluded.pseudo,
       status = 'ACTIVE',
       famileo_email = excluded.famileo_email,
       famileo_name = excluded.famileo_name,
       famileo_password_enc = excluded.famileo_password_enc,
       avatar_url = excluded.avatar_url,
       avatar_file_id = excluded.avatar_file_id,
       updated_at = excluded.updated_at`
  )
    .bind(crypto.randomUUID(), email, pseudo, famileoEmail, famileoName, famileoPasswordEnc, avatarUrl, avatarFileId, existing?.date_created || now, now)
    .run()

  const saved = await getUserByEmail(context.env.DB, email)
  if (!saved) {
    return fail('SAVE_FAILED', 'Failed to save profile', 500)
  }

  return ok(await toProfile(context.env, saved, email))
}
