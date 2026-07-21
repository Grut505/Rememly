export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')

  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  })
}

export function ok<T>(data: T, init: ResponseInit = {}) {
  return json({ ok: true, data }, init)
}

export function fail(code: string, message: string, status = 400, details?: string) {
  return json(
    {
      ok: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    { status }
  )
}
