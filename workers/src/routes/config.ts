import { requireAuth } from '../lib/auth'
import { readJson } from '../lib/request'
import { fail, ok } from '../lib/response'
import type { RouteHandler } from '../lib/router'

export const getConfigHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  const url = new URL(request.url)
  const key = url.searchParams.get('key')

  if (!key) {
    return fail('MISSING_KEY', 'Config key is required', 400)
  }

  const row = await context.env.DB.prepare(
    'select key, value from config where key = ?1 limit 1'
  )
    .bind(key)
    .first<{ key: string; value: string | null }>()

  if (!row) {
    return fail('NOT_FOUND', 'Config key not found', 404)
  }

  return ok(row)
}

export const setConfigHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  const body = await readJson<{ key?: string; value?: string }>(request)
  if (!body.key) {
    return fail('MISSING_KEY', 'Config key is required', 400)
  }

  await context.env.DB.prepare(
    `insert into config (key, value, updated_at)
     values (?1, ?2, ?3)
     on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at`
  )
    .bind(body.key, body.value || '', new Date().toISOString())
    .run()

  return ok({ key: body.key, value: body.value || '' })
}

export const configLinksHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  return ok({
    frontend: 'preparation-only',
    backend: 'worker-preparation',
    docs: 'docs/MIGRATION_EXECUTION_PLAN.md',
  })
}
