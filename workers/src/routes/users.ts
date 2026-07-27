import { requireAuth } from '../lib/auth'
import { readJson, normalizeEmail } from '../lib/request'
import { fail, ok } from '../lib/response'
import type { RouteHandler } from '../lib/router'

interface ProfileBody {
  pseudo?: string
  famileo_email?: string
  famileo_name?: string
  famileo_password?: string
  avatar_url?: string
  avatar_file_id?: string
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

function toProfile(user: Awaited<ReturnType<typeof getUserByEmail>> | null, email: string) {
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
    avatar_base64: '',
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
  return ok(toProfile(user, auth.user.email))
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
  const avatarUrl = body.avatar_url !== undefined ? body.avatar_url : existing?.avatar_url || ''
  const avatarFileId = body.avatar_file_id !== undefined ? body.avatar_file_id : existing?.avatar_file_id || ''
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

  return ok(toProfile(saved, email))
}
