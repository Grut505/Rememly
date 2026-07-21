export async function readJson<T>(request: Request): Promise<T> {
  const contentLength = request.headers.get('content-length')
  if (contentLength === '0') {
    return {} as T
  }

  const text = await request.text()
  if (!text) {
    return {} as T
  }

  return JSON.parse(text) as T
}

export function getAuthValue(request: Request) {
  const url = new URL(request.url)
  const authParam = url.searchParams.get('auth')
  if (authParam) {
    return authParam
  }

  return request.headers.get('authorization') || ''
}

export function normalizeEmail(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase()
}
