import { ok } from '../lib/response'
import type { RouteHandler } from '../lib/router'

export const healthHandler: RouteHandler = async (_request, context) => {
  const row = await context.env.DB.prepare('select 1 as ok').first<{ ok: number }>()

  return ok({
    service: 'rememly-api',
    env: context.env.APP_ENV,
    request_id: context.requestId,
    database: row?.ok === 1 ? 'ok' : 'unknown',
  })
}
