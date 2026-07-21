import { requireAuth } from '../lib/auth'
import { readJson } from '../lib/request'
import { fail, ok } from '../lib/response'
import type { RouteHandler } from '../lib/router'

function getCategoryFromPath(request: Request) {
  const pathname = new URL(request.url).pathname
  if (pathname.includes('/logs/pdf/')) return 'pdf'
  if (pathname.includes('/logs/famileo/')) return 'famileo'
  return ''
}

export const logsRangeHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) return auth.response

  const category = getCategoryFromPath(request)
  if (!category) return fail('INVALID_CATEGORY', 'Unsupported log category', 400)

  const row = await context.env.DB.prepare(
    `select min(created_at) as min, max(created_at) as max, count(*) as count
       from app_logs
      where category = ?1`
  )
    .bind(category)
    .first<{ min: string | null; max: string | null; count: number }>()

  return ok({
    min: row?.min || null,
    max: row?.max || null,
    count: Number(row?.count || 0),
  })
}

export const logsClearHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) return auth.response

  const category = getCategoryFromPath(request)
  if (!category) return fail('INVALID_CATEGORY', 'Unsupported log category', 400)

  const body = await readJson<{ from?: string; to?: string }>(request)
  const conditions = ['category = ?1']
  const bindings: Array<string> = [category]

  if (body.from) {
    conditions.push('created_at >= ?2')
    bindings.push(body.from)
  }
  if (body.to) {
    conditions.push(`created_at <= ?${bindings.length + 1}`)
    bindings.push(body.to)
  }

  const before = await context.env.DB.prepare(
    `select count(*) as count from app_logs where ${conditions.join(' and ')}`
  )
    .bind(...bindings)
    .first<{ count: number }>()

  await context.env.DB.prepare(`delete from app_logs where ${conditions.join(' and ')}`)
    .bind(...bindings)
    .run()

  const remaining = await context.env.DB.prepare(
    'select count(*) as count from app_logs where category = ?1'
  )
    .bind(category)
    .first<{ count: number }>()

  return ok({
    deleted: Number(before?.count || 0),
    remaining: Number(remaining?.count || 0),
  })
}
