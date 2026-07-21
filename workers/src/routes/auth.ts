import { requireAuth } from '../lib/auth'
import { ok } from '../lib/response'
import type { RouteHandler } from '../lib/router'

export const authCheckHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env, { allowPendingCreate: true })
  if (!auth.ok) {
    return auth.response
  }

  return ok({
    user: auth.user,
    timezone: 'Europe/Paris',
  })
}
