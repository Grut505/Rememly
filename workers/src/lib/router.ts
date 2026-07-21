import { fail } from './response'
import type { AppContext } from '../types'

export type RouteHandler = (request: Request, context: AppContext) => Promise<Response> | Response

interface Route {
  method: string
  path: string
  handler: RouteHandler
}

export class Router {
  private routes: Route[] = []

  on(method: string, path: string, handler: RouteHandler) {
    this.routes.push({ method: method.toUpperCase(), path, handler })
  }

  async handle(request: Request, context: AppContext) {
    const url = new URL(request.url)
    const pathname = url.pathname.replace(/\/$/, '') || '/'
    const method = request.method.toUpperCase()
    const route = this.routes.find((entry) => entry.method === method && entry.path === pathname)

    if (!route) {
      return fail('NOT_FOUND', `No route for ${method} ${pathname}`, 404)
    }

    return route.handler(request, context)
  }
}
