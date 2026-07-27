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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

export const imageFetchHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  const url = new URL(request.url)
  const fileId = url.searchParams.get('fileId')
  if (!fileId) {
    return fail('INVALID_PARAMS', 'fileId is required', 400)
  }

  try {
    const response = await fetch(`https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w2000`)
    if (response.status !== 200) {
      return fail('FETCH_ERROR', `Failed to fetch image from Drive: HTTP ${response.status}`, 502)
    }

    const buffer = await response.arrayBuffer()
    return ok({ base64: arrayBufferToBase64(buffer) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return fail('FETCH_ERROR', `Failed to fetch image from Drive: ${message}`, 502)
  }
}
