import { requireAuth, issueSessionToken } from '../lib/auth'
import { ok } from '../lib/response'
import type { RouteHandler } from '../lib/router'

export const authCheckHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env, { allowPendingCreate: true, allowBareEmail: true })
  if (!auth.ok) {
    return auth.response
  }

  const sessionToken = await issueSessionToken(context.env, auth.user.email)

  return ok({
    user: {
      email: auth.user.email,
      name: auth.user.email.split('@')[0],
    },
    timezone: 'Europe/Paris',
    ...(sessionToken ? { session_token: sessionToken } : {}),
  })
}
