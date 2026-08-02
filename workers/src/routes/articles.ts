import { requireAuth } from '../lib/auth'
import { readJson, normalizeEmail } from '../lib/request'
import { fail, ok } from '../lib/response'
import type { RouteHandler } from '../lib/router'
import type { Env } from '../types'

interface ArticleImagePayload {
  base64: string
  mimeType?: string
  fileName?: string
}

interface ArticleBody {
  id?: string
  date?: string
  auteur?: string
  texte?: string
  image_url?: string
  image_file_id?: string
  image?: ArticleImagePayload
  assembly_state?: unknown
  full_page?: boolean
  status?: string
  famileo_post_id?: string
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function uploadArticleImageToR2(env: Env, articleId: string, image: ArticleImagePayload) {
  const ext = (image.fileName || '').split('.').pop() || 'jpg'
  const key = `articles/${articleId}/original/${Date.now()}.${ext}`
  await env.FILES.put(key, base64ToUint8Array(image.base64), {
    httpMetadata: { contentType: image.mimeType || 'image/jpeg' },
  })
  return { key, url: `r2:${key}` }
}

function normalizeFamileoText(value: string | null | undefined) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function buildFamileoFingerprint(authorEmail: string, dateValue: string, textValue: string) {
  const author = normalizeFamileoText(authorEmail)
  const date = new Date(dateValue)
  const dateKey = Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
  const text = normalizeFamileoText(textValue)
  return sha256Hex(`${author}|${dateKey}|${text}`)
}

// 'all' means Active + Draft - Deleted is handled separately as an override,
// never folded into "all" (see FiltersPanel: the Deleted toggle overrides
// whatever All/Active/Draft is selected, it doesn't combine with it).
function parseStatusFilter(value: string | null) {
  const normalized = String(value || 'active').toLowerCase()
  if (normalized === 'draft') return ['DRAFT']
  if (normalized === 'deleted') return ['DELETED']
  if (normalized === 'all') return ['ACTIVE', 'DRAFT']
  return ['ACTIVE']
}

function buildArticlesQuery(url: URL) {
  const year = url.searchParams.get('year')
  const month = url.searchParams.get('month')
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const author = url.searchParams.get('author')
  const limit = Math.min(Number(url.searchParams.get('limit') || '40') || 40, 200)
  const cursor = Number(url.searchParams.get('cursor') || '0') || 0
  const statusFilter = parseStatusFilter(url.searchParams.get('status_filter'))
  const sourceFilter = String(url.searchParams.get('source_filter') || 'all')
  const duplicatesOnly = url.searchParams.get('duplicates_only') === 'true'

  const conditions: string[] = []
  const bindings: Array<string | number> = []

  conditions.push(`a.status in (${statusFilter.map(() => '?').join(', ')})`)
  bindings.push(...statusFilter)

  if (year) {
    conditions.push("strftime('%Y', date) = ?")
    bindings.push(year)
  }

  if (month) {
    conditions.push("strftime('%m', date) = ?")
    bindings.push(month)
  }

  if (from) {
    conditions.push('date >= ?')
    bindings.push(from)
  }

  if (to) {
    conditions.push('date <= ?')
    bindings.push(to)
  }

  if (author) {
    conditions.push('lower(auteur) = ?')
    bindings.push(normalizeEmail(author))
  }

  if (sourceFilter === 'famileo') {
    conditions.push("coalesce(famileo_post_id, '') != ''")
  }

  if (sourceFilter === 'local') {
    conditions.push("coalesce(famileo_post_id, '') = ''")
  }

  if (duplicatesOnly) {
    conditions.push(`coalesce(famileo_post_id, '') != '' and famileo_post_id in (
      select famileo_post_id
      from articles
      where coalesce(famileo_post_id, '') != '' and status != 'DELETED'
      group by famileo_post_id
      having count(*) > 1
    )`)
  }

  const whereSql = conditions.length ? `where ${conditions.join(' and ')}` : ''
  const sql = `
    select a.id, a.date, a.auteur, a.texte, a.image_url, a.image_file_id,
           a.assembly_state_json as assembly_state, a.full_page, a.status,
           a.famileo_post_id, a.famileo_fingerprint,
           coalesce(u.pseudo, substr(a.auteur, 1, instr(a.auteur, '@') - 1), 'Unknown') as author_pseudo,
           case
             when a.famileo_post_id is null or a.famileo_post_id = '' then 0
             when exists (
               select 1
               from articles a2
               where a2.famileo_post_id = a.famileo_post_id
                 and a2.id != a.id
                 and a2.status != 'DELETED'
             ) then 1
             else 0
           end as is_duplicate
      from articles a
      left join users u on lower(u.email) = lower(a.auteur)
      ${whereSql}
      order by a.date desc
      limit ? offset ?
  `

  const countSql = `select count(*) as count from articles a ${whereSql}`
  return { sql, countSql, bindings, limit, cursor }
}

export const listArticlesHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  const url = new URL(request.url)
  const { sql, countSql, bindings, limit, cursor } = buildArticlesQuery(url)
  const rows = await context.env.DB.prepare(sql)
    .bind(...bindings, limit, cursor)
    .all<Record<string, unknown>>()
  const countRow = await context.env.DB.prepare(countSql)
    .bind(...bindings)
    .first<{ count: number }>()

  const total = Number(countRow?.count || 0)
  const nextOffset = cursor + limit

  const items = (rows.results || []).map((row) => ({
    ...row,
    famileo_post_id: row.famileo_post_id ? Number(row.famileo_post_id) : '',
    full_page: !!row.full_page,
    is_duplicate: !!row.is_duplicate,
  }))

  return ok({
    items,
    next_cursor: nextOffset < total ? String(nextOffset) : null,
  })
}

export const articlesAuthorsHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  const url = new URL(request.url)
  const statusFilter = parseStatusFilter(url.searchParams.get('status_filter'))
  const sourceFilter = String(url.searchParams.get('source_filter') || 'all')
  const conditions = [`a.status in (${statusFilter.map(() => '?').join(', ')})`]
  const bindings: Array<string> = [...statusFilter]

  if (sourceFilter === 'famileo') {
    conditions.push("coalesce(a.famileo_post_id, '') != ''")
  }
  if (sourceFilter === 'local') {
    conditions.push("coalesce(a.famileo_post_id, '') = ''")
  }

  const rows = await context.env.DB.prepare(
    `select distinct a.auteur as email,
            coalesce(u.pseudo, substr(a.auteur, 1, instr(a.auteur, '@') - 1), a.auteur) as pseudo
       from articles a
       left join users u on lower(u.email) = lower(a.auteur)
      where ${conditions.join(' and ')} and coalesce(a.auteur, '') != ''
      order by lower(coalesce(u.pseudo, a.auteur)) asc`
  )
    .bind(...bindings)
    .all<Record<string, unknown>>()

  return ok({ authors: rows.results || [] })
}

export const articleGetHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) {
    return fail('INVALID_PARAMS', 'id is required', 400)
  }

  const row = await context.env.DB.prepare(
    `select a.id, a.date, a.auteur, a.texte, a.image_url, a.image_file_id,
            a.assembly_state_json as assembly_state, a.full_page, a.status,
            a.famileo_post_id, a.famileo_fingerprint,
            coalesce(u.pseudo, substr(a.auteur, 1, instr(a.auteur, '@') - 1), 'Unknown') as author_pseudo
       from articles a
       left join users u on lower(u.email) = lower(a.auteur)
      where a.id = ?1
      limit 1`
  )
    .bind(id)
    .first<Record<string, unknown>>()

  if (!row) {
    return fail('NOT_FOUND', 'Article not found', 404)
  }

  return ok(row)
}

export const articleCreateHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  const body = await readJson<ArticleBody>(request)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const date = body.date || now
  const auteur = body.auteur || auth.user.email
  const famileoFingerprint = body.famileo_post_id
    ? await buildFamileoFingerprint(auteur, date, body.texte || '')
    : ''

  let imageUrl = body.image_url || ''
  let imageFileId = body.image_file_id || ''
  if (body.image?.base64) {
    const uploaded = await uploadArticleImageToR2(context.env, id, body.image)
    imageUrl = uploaded.url
    imageFileId = uploaded.key
  }

  await context.env.DB.prepare(
    `insert into articles (
       id, date, auteur, author_pseudo, texte, image_url, image_file_id,
       assembly_state_json, full_page, status, famileo_post_id, famileo_fingerprint,
       created_at, updated_at
     ) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13)`
  )
    .bind(
      id,
      date,
      auteur,
      auth.user.name,
      body.texte || '',
      imageUrl,
      imageFileId,
      body.assembly_state ? JSON.stringify(body.assembly_state) : '',
      body.full_page ? 1 : 0,
      body.status || 'ACTIVE',
      body.famileo_post_id || '',
      famileoFingerprint,
      now
    )
    .run()

  const row = await context.env.DB.prepare('select * from articles where id = ?1 limit 1').bind(id).first<Record<string, unknown>>()
  return ok(row)
}

export const articleUpdateHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  const body = await readJson<ArticleBody>(request)
  if (!body.id) {
    return fail('INVALID_PARAMS', 'id is required', 400)
  }

  const existing = await context.env.DB.prepare('select * from articles where id = ?1 limit 1').bind(body.id).first<Record<string, unknown>>()
  if (!existing) {
    return fail('NOT_FOUND', 'Article not found', 404)
  }

  const date = String(body.date ?? existing.date ?? new Date().toISOString())
  const auteur = String(body.auteur ?? existing.auteur ?? auth.user.email)
  const texte = String(body.texte ?? existing.texte ?? '')
  const famileoPostId = String(body.famileo_post_id ?? existing.famileo_post_id ?? '')
  const famileoFingerprint = famileoPostId
    ? await buildFamileoFingerprint(auteur, date, texte)
    : ''

  let imageUrl = String(body.image_url ?? existing.image_url ?? '')
  let imageFileId = String(body.image_file_id ?? existing.image_file_id ?? '')
  if (body.image?.base64) {
    const uploaded = await uploadArticleImageToR2(context.env, body.id, body.image)
    imageUrl = uploaded.url
    imageFileId = uploaded.key
  }

  await context.env.DB.prepare(
    `update articles
        set date = ?2,
            auteur = ?3,
            author_pseudo = ?4,
            texte = ?5,
            image_url = ?6,
            image_file_id = ?7,
            assembly_state_json = ?8,
            full_page = ?9,
            status = ?10,
            famileo_post_id = ?11,
            famileo_fingerprint = ?12,
            updated_at = ?13
      where id = ?1`
  )
    .bind(
      body.id,
      date,
      auteur,
      auth.user.name,
      texte,
      imageUrl,
      imageFileId,
      body.assembly_state !== undefined ? JSON.stringify(body.assembly_state || '') : String(existing.assembly_state_json ?? ''),
      body.full_page !== undefined ? (body.full_page ? 1 : 0) : Number(existing.full_page || 0),
      String(body.status ?? existing.status ?? 'ACTIVE'),
      famileoPostId,
      famileoFingerprint,
      new Date().toISOString()
    )
    .run()

  const saved = await context.env.DB.prepare('select * from articles where id = ?1 limit 1').bind(body.id).first<Record<string, unknown>>()
  return ok(saved)
}

export const articleDeleteHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) {
    return fail('INVALID_PARAMS', 'id is required', 400)
  }

  await context.env.DB.prepare('update articles set status = ?2, updated_at = ?3, deleted_at = ?3 where id = ?1')
    .bind(id, 'DELETED', new Date().toISOString())
    .run()

  return ok({ id, deleted: true })
}

export const articlePermanentDeleteHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) {
    return fail('INVALID_PARAMS', 'id is required', 400)
  }

  await context.env.DB.prepare('delete from articles where id = ?1').bind(id).run()
  return ok({ id, deleted: true, permanent: true })
}

export const backfillFamileoFingerprintsHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  const totalRow = await context.env.DB.prepare('select count(*) as count from articles').first<{ count: number }>()
  const total = Number(totalRow?.count || 0)

  const rows = await context.env.DB.prepare(
    `select id, auteur, date, texte from articles where coalesce(famileo_fingerprint, '') = ''`
  ).all<{ id: string; auteur: string | null; date: string; texte: string | null }>()

  const missing = rows.results || []
  if (missing.length === 0) {
    return ok({ updated: 0, total })
  }

  const statements = await Promise.all(
    missing.map(async (row) => {
      const fingerprint = await buildFamileoFingerprint(row.auteur || '', row.date, row.texte || '')
      return context.env.DB.prepare('update articles set famileo_fingerprint = ?2 where id = ?1').bind(row.id, fingerprint)
    })
  )
  await context.env.DB.batch(statements)

  return ok({ updated: missing.length, total })
}
