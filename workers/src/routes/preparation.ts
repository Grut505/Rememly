import { requireAuth } from '../lib/auth'
import { fail, ok } from '../lib/response'
import type { RouteHandler } from '../lib/router'

function featureName(request: Request) {
  return new URL(request.url).pathname.replace(/^\//, '')
}

export const preparationOnlyHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  return fail(
    'PREPARATION_ONLY',
    `${featureName(request)} is not implemented in Worker preparation mode yet. Keep using the Google backend for this flow.`,
    501
  )
}

export const imageFetchHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  return ok({
    available: false,
    mode: 'preparation-only',
    message: 'image/fetch stays on the Google backend for now.',
  })
}
