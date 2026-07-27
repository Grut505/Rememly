import { requireAuth } from '../lib/auth'
import { readJson, normalizeEmail } from '../lib/request'
import { fail, ok } from '../lib/response'
import type { RouteHandler } from '../lib/router'
import type { Env } from '../types'

interface FamileoRawPost {
  wall_post_id: number
  text: string
  date: string
  date_tz: string
  author_id: number
  author_name: string
  image: string
  image_2x: string
  full_image: string
  image_orientation: 'landscape' | 'portrait'
}

interface FamileoPostsApiResponse {
  familyWall?: FamileoRawPost[]
  unreadPost?: number
}

async function getConfigValue(env: Env, key: string): Promise<string | null> {
  const row = await env.DB.prepare('select value from config where key = ?1 limit 1')
    .bind(key)
    .first<{ value: string | null }>()
  return row?.value ?? null
}

async function resolveFamileoEmailForUser(env: Env, appEmail: string): Promise<string> {
  const row = await env.DB.prepare('select famileo_email from users where lower(email) = ?1 limit 1')
    .bind(normalizeEmail(appEmail))
    .first<{ famileo_email: string | null }>()
  return normalizeEmail(row?.famileo_email || appEmail)
}

async function getFamileoSession(env: Env, famileoEmail: string) {
  return env.DB.prepare('select phpsessid, rememberme from famileo_sessions where famileo_email = ?1 limit 1')
    .bind(famileoEmail)
    .first<{ phpsessid: string; rememberme: string }>()
}

function formatFamileoCookies(session: { phpsessid: string; rememberme: string }) {
  return `PHPSESSID=${session.phpsessid}; REMEMBERME=${session.rememberme}`
}

async function famileoFetchPosts(
  env: Env,
  opts: { limit: number; timestamp: string | null; familyId: string | null; famileoEmail: string }
): Promise<FamileoPostsApiResponse> {
  const familyId = opts.familyId || (await getConfigValue(env, 'famileo_family_id')) || '321238'
  const session = await getFamileoSession(env, opts.famileoEmail)
  if (!session) {
    throw new Error('Famileo session not configured. Waiting for GitHub Actions to refresh cookies.')
  }

  let url = `https://www.famileo.com/api/families/${familyId}/posts?limit=${opts.limit}`
  if (opts.timestamp) {
    url += `&timestamp=${encodeURIComponent(opts.timestamp)}`
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Cookie: formatFamileoCookies(session),
      Accept: 'application/json',
      Referer: 'https://www.famileo.com/',
    },
  })

  if (response.status === 401 || response.status === 403) {
    throw new Error('Session expired. Please trigger a Famileo refresh.')
  }
  if (response.status !== 200) {
    throw new Error(`Failed to fetch posts: HTTP ${response.status}`)
  }

  return response.json()
}

async function buildFamileoAuthorMap(env: Env) {
  const rows = await env.DB.prepare(
    `select email, pseudo, famileo_name from users
      where status = 'ACTIVE' and coalesce(famileo_name, '') != ''`
  ).all<{ email: string; pseudo: string | null; famileo_name: string }>()

  const map = new Map<string, { email: string; pseudo: string }>()
  for (const row of rows.results || []) {
    const key = row.famileo_name.trim().toLowerCase()
    if (!key || map.has(key)) continue
    map.set(key, { email: row.email, pseudo: row.pseudo || '' })
  }
  return map
}

function getSessionMessage(configured: boolean) {
  if (configured) {
    return 'Famileo session is configured in Worker preparation storage.'
  }
  return 'Famileo session is not configured in Worker preparation storage yet.'
}

export const famileoStatusHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  const session = await context.env.DB.prepare(
    'select famileo_email, updated_at from famileo_sessions order by updated_at desc limit 1'
  ).first<{ famileo_email: string | null; updated_at: string | null }>()

  const configured = !!session
  return ok({
    configured,
    valid: configured,
    message: getSessionMessage(configured),
    famileo_email: session?.famileo_email || '',
    updated_at: session?.updated_at || null,
  })
}

export const famileoTriggerRefreshHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  const targetEmail = normalizeEmail(auth.user.email)
  if (!targetEmail) {
    return fail('INVALID_DATA', 'user_email is required', 400)
  }

  const user = await context.env.DB.prepare(
    'select famileo_email, famileo_password_enc from users where lower(email) = ?1 limit 1'
  )
    .bind(targetEmail)
    .first<{ famileo_email: string | null; famileo_password_enc: string | null }>()

  if (!user || !user.famileo_password_enc) {
    return fail('INVALID_DATA', 'Famileo password is missing for this user', 400)
  }
  if (!user.famileo_email) {
    return fail('INVALID_DATA', 'Famileo email is missing for this user', 400)
  }

  const githubToken = context.env.GITHUB_TOKEN
  if (!githubToken) {
    return fail('NOT_CONFIGURED', 'GitHub token not configured', 400)
  }

  const resolvedFamileoEmail = await resolveFamileoEmailForUser(context.env, targetEmail)

  try {
    const response = await fetch(
      'https://api.github.com/repos/Grut505/Rememly/actions/workflows/famileo-refresh.yml/dispatches',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Rememly-Worker',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            famileo_email: resolvedFamileoEmail || user.famileo_email || '',
          },
        }),
      }
    )

    if (response.status === 204) {
      return ok({ message: 'Workflow triggered successfully. Session will be refreshed in ~2 minutes.' })
    }

    const responseText = await response.text()
    let errorCode = 'GITHUB_ERROR'
    let errorMessage = 'Famileo refresh could not be started due to a GitHub workflow error.'

    if (response.status === 401) {
      errorCode = 'GITHUB_TOKEN_INVALID'
      errorMessage =
        'Famileo refresh is temporarily unavailable because the server GitHub token is expired, revoked, or invalid. Please contact an administrator.'
    } else if (response.status === 403) {
      errorCode = 'GITHUB_TOKEN_FORBIDDEN'
      errorMessage =
        'Famileo refresh is temporarily unavailable because the server GitHub token does not have permission to run the workflow. Please contact an administrator.'
    } else if (response.status === 404) {
      errorCode = 'GITHUB_WORKFLOW_NOT_FOUND'
      errorMessage = 'Famileo refresh is temporarily unavailable because the GitHub workflow could not be found or accessed.'
    }

    return fail(errorCode, errorMessage, 502, responseText)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown trigger error'
    return fail('TRIGGER_ERROR', message, 500)
  }
}

export const famileoPostsHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get('limit') || '20') || 20, 100)
  const timestamp = url.searchParams.get('timestamp')
  const familyIdParam = url.searchParams.get('family_id')
  const authorFilter = (url.searchParams.get('author_filter') || 'declared').toLowerCase()
  const isSpecificAuthor = !['all', 'others', 'declared', ''].includes(authorFilter)

  try {
    const famileoEmail = await resolveFamileoEmailForUser(context.env, auth.user.email)
    const response = await famileoFetchPosts(context.env, {
      limit,
      timestamp,
      familyId: familyIdParam,
      famileoEmail,
    })
    const authorMap = await buildFamileoAuthorMap(context.env)

    const rawPosts = response.familyWall || []
    const counts = { declared: 0, others: 0, total: rawPosts.length }

    const posts = rawPosts
      .filter((post) => {
        const authorKey = String(post.author_name || '').trim().toLowerCase()
        const author = authorMap.get(authorKey)
        const isDeclared = !!author
        if (isDeclared) counts.declared += 1
        else counts.others += 1

        if (authorFilter === 'all') return true
        if (authorFilter === 'others') return !isDeclared
        if (authorFilter === 'declared') return isDeclared
        if (isSpecificAuthor) {
          const authorEmail = author ? author.email.toLowerCase() : ''
          const authorPseudo = author ? author.pseudo.toLowerCase() : ''
          return authorFilter === authorEmail || authorFilter === authorPseudo || authorFilter === authorKey
        }
        return isDeclared
      })
      .map((post) => {
        const authorKey = String(post.author_name || '').trim().toLowerCase()
        const author = authorMap.get(authorKey)
        const authorPseudo = author?.pseudo || String(post.author_name || '').split(' ')[0]

        return {
          id: post.wall_post_id,
          text: post.text,
          date: post.date,
          date_tz: post.date_tz,
          author_id: post.author_id,
          author_name: post.author_name,
          author_email: author?.email || '',
          author_pseudo: authorPseudo,
          image_url: post.image_2x || post.image,
          full_image_url: post.full_image || post.image_2x || post.image,
          image_orientation: post.image_orientation,
        }
      })

    let nextTimestamp: string | null = null
    if (rawPosts.length > 0) {
      const lastRawPost = rawPosts[rawPosts.length - 1]
      nextTimestamp = lastRawPost.date_tz || new Date(lastRawPost.date).toISOString()
    }

    return ok({
      posts,
      unread: response.unreadPost || 0,
      next_timestamp: nextTimestamp,
      has_more: rawPosts.length === limit,
      counts,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Famileo error'
    return fail('FAMILEO_ERROR', message, 502)
  }
}

const famileoPreparationOnlyHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  return fail(
    'PREPARATION_ONLY',
    'This Famileo flow remains on the Google backend for now. Worker preparation mode does not support it yet.',
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

export const famileoImageHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  const url = new URL(request.url)
  const imageUrlParam = url.searchParams.get('url')
  if (!imageUrlParam) {
    return fail('MISSING_URL', 'Image URL required', 400)
  }

  const imageUrl = decodeURIComponent(imageUrlParam)
  if (!imageUrl.includes('cloudfront.net') && !imageUrl.includes('famileo.com') && !imageUrl.includes('famileo.')) {
    return fail('FAMILEO_ERROR', `Invalid Famileo image URL: ${imageUrl}`, 400)
  }

  try {
    const famileoEmail = await resolveFamileoEmailForUser(context.env, auth.user.email)
    const session = await getFamileoSession(context.env, famileoEmail)
    if (!session) {
      throw new Error('Famileo session not configured. Waiting for GitHub Actions to refresh cookies.')
    }

    const response = await fetch(imageUrl, {
      method: 'GET',
      headers: {
        Cookie: formatFamileoCookies(session),
        Referer: 'https://www.famileo.com/',
      },
    })

    if (response.status !== 200) {
      throw new Error(`Failed to fetch image: HTTP ${response.status}`)
    }

    const buffer = await response.arrayBuffer()
    const mimeType = response.headers.get('content-type') || 'image/jpeg'

    return ok({ base64: arrayBufferToBase64(buffer), mimeType })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Famileo error'
    return fail('FAMILEO_ERROR', message, 502)
  }
}

export const famileoCreatePostHandler: RouteHandler = famileoPreparationOnlyHandler
export const famileoPresignedImageHandler: RouteHandler = famileoPreparationOnlyHandler
export const famileoUploadImageHandler: RouteHandler = famileoPreparationOnlyHandler

export const familiesHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  const rows = await context.env.DB.prepare(
    'select id, name, famileo_id from families order by lower(name) asc'
  ).all<{ id: string; name: string; famileo_id: string }>()

  const families = (rows.results || []).map((row) => ({
    id: Number(row.id),
    name: row.name,
    famileo_id: Number(row.famileo_id),
  }))

  return ok({ families })
}

export const importedIdsHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  const rows = await context.env.DB.prepare(
    `select distinct famileo_post_id as id
       from articles
      where coalesce(famileo_post_id, '') != ''
        and status != 'DELETED'`
  ).all<{ id: string }>()

  return ok({ ids: (rows.results || []).map((row) => row.id) })
}

export const importedFingerprintsHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) {
    return auth.response
  }

  const rows = await context.env.DB.prepare(
    `select distinct famileo_fingerprint as fingerprint
       from articles
      where coalesce(famileo_fingerprint, '') != ''
        and status != 'DELETED'`
  ).all<{ fingerprint: string }>()

  return ok({ fingerprints: (rows.results || []).map((row) => row.fingerprint) })
}

export const famileoUpdateSessionHandler: RouteHandler = async (request, context) => {
  const body = await readJson<{ token?: string; phpsessid?: string; rememberme?: string; famileo_email?: string }>(request)
  if (!context.env.GITHUB_TRIGGER_TOKEN || body.token !== context.env.GITHUB_TRIGGER_TOKEN) {
    return fail('UNAUTHORIZED', 'Invalid token', 401)
  }
  if (!body.phpsessid || !body.rememberme) {
    return fail('INVALID_DATA', 'Missing phpsessid or rememberme', 400)
  }

  await context.env.DB.prepare(
    `insert into famileo_sessions (famileo_email, phpsessid, rememberme, updated_at, expires_at)
     values (?1, ?2, ?3, ?4, '')
     on conflict(famileo_email) do update set
       phpsessid = excluded.phpsessid,
       rememberme = excluded.rememberme,
       updated_at = excluded.updated_at`
  )
    .bind(body.famileo_email || '', body.phpsessid, body.rememberme, new Date().toISOString())
    .run()

  return ok({
    message: 'Session updated successfully',
    famileo_email: body.famileo_email || '',
  })
}
