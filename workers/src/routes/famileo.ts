import { requireAuth } from '../lib/auth'
import { readJson } from '../lib/request'
import { fail, ok } from '../lib/response'
import type { RouteHandler } from '../lib/router'

function getSessionMessage(configured: boolean) {
  if (configured) {
    return 'Famileo session is configured in Worker preparation storage.'
  }
  return 'Famileo session is not configured in Worker preparation storage yet.'
}

export const famileoStatusHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  const session = await context.env.DB.prepare(
    'select famileo_email, updated_at from famileo_sessions order by updated_at desc limit 1'
  ).first<{ famileo_email: string | null; updated_at: string | null }>()

  const configured = !!session
  return ok({
    configured,
    valid: configured,
    message: getSessionMessage(configured),
    famileo_email: session?.famileo_email || '',
    updated_at: session?.updated_at || null,
  })
}

export const famileoTriggerRefreshHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  return fail(
    'PREPARATION_ONLY',
    'Famileo refresh remains on the Google backend for now. Worker preparation mode does not trigger refresh yet.',
    501
  )
}

export const famileoPostsHandler: RouteHandler = famileoTriggerRefreshHandler
export const famileoImageHandler: RouteHandler = famileoTriggerRefreshHandler
export const famileoCreatePostHandler: RouteHandler = famileoTriggerRefreshHandler
export const famileoPresignedImageHandler: RouteHandler = famileoTriggerRefreshHandler
export const famileoUploadImageHandler: RouteHandler = famileoTriggerRefreshHandler

export const familiesHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  const rows = await context.env.DB.prepare(
    'select id, name, famileo_id from families order by lower(name) asc'
  ).all<{ id: string; name: string; famileo_id: string }>()

  const families = (rows.results || []).map((row) => ({
    id: Number(row.id),
    name: row.name,
    famileo_id: Number(row.famileo_id),
  }))

  return ok({ families })
}

export const importedIdsHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  const rows = await context.env.DB.prepare(
    `select distinct famileo_post_id as id
       from articles
      where coalesce(famileo_post_id, '') != ''
        and status != 'DELETED'`
  ).all<{ id: string }>()

  return ok({ ids: (rows.results || []).map((row) => row.id) })
}

export const importedFingerprintsHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  const rows = await context.env.DB.prepare(
    `select distinct famileo_fingerprint as fingerprint
       from articles
      where coalesce(famileo_fingerprint, '') != ''
        and status != 'DELETED'`
  ).all<{ fingerprint: string }>()

  return ok({ fingerprints: (rows.results || []).map((row) => row.fingerprint) })
}

export const famileoUpdateSessionHandler: RouteHandler = async (request, context) => {
  const body = await readJson<{ token?: string; phpsessid?: string; rememberme?: string; famileo_email?: string }>(request)
  if (!context.env.GITHUB_TRIGGER_TOKEN || body.token !== context.env.GITHUB_TRIGGER_TOKEN) {
    return fail('UNAUTHORIZED', 'Invalid token', 401)
  }
  if (!body.phpsessid || !body.rememberme) {
    return fail('INVALID_DATA', 'Missing phpsessid or rememberme', 400)
  }

  await context.env.DB.prepare(
    `insert into famileo_sessions (famileo_email, phpsessid, rememberme, updated_at, expires_at)
     values (?1, ?2, ?3, ?4, '')
     on conflict(famileo_email) do update set
       phpsessid = excluded.phpsessid,
       rememberme = excluded.rememberme,
       updated_at = excluded.updated_at`
  )
    .bind(body.famileo_email || '', body.phpsessid, body.rememberme, new Date().toISOString())
    .run()

  return ok({
    message: 'Session updated successfully',
    famileo_email: body.famileo_email || '',
  })
}
