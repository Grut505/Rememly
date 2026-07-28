import { fail } from './response'
import { getAuthValue, normalizeEmail } from './request'
import type { Env } from '../types'

interface WorkerUser {
  email: string
  name: string
}

interface AuthResult {
  ok: true
  user: WorkerUser
}

interface AuthFailure {
  ok: false
  response: Response
}

type AuthOutcome = AuthResult | AuthFailure

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function hmacSign(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return base64UrlEncode(new Uint8Array(signature))
}

/**
 * Issues a signed, expiring session token (HMAC-SHA256 over {email, exp} using
 * AUTH_SECRET) so subsequent requests don't have to rely on a bare, unverifiable
 * "Email <address>" claim - anyone who knew a whitelisted email could otherwise
 * impersonate that user. Returns null if AUTH_SECRET isn't configured, in which
 * case callers should fall back to the legacy Email scheme.
 */
export async function issueSessionToken(env: Env, email: string): Promise<string | null> {
  if (!env.AUTH_SECRET) return null
  const payload = JSON.stringify({ email: normalizeEmail(email), exp: Date.now() + SESSION_TTL_MS })
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(payload))
  const signature = await hmacSign(env.AUTH_SECRET, payloadB64)
  return `${payloadB64}.${signature}`
}

async function verifySessionToken(env: Env, token: string): Promise<string | null> {
  if (!env.AUTH_SECRET) return null
  const [payloadB64, signature] = token.split('.')
  if (!payloadB64 || !signature) return null

  const expectedSignature = await hmacSign(env.AUTH_SECRET, payloadB64)
  if (signature !== expectedSignature) return null

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64))) as {
      email?: string
      exp?: number
    }
    if (!payload.email || !payload.exp || payload.exp < Date.now()) return null
    return normalizeEmail(payload.email)
  } catch {
    return null
  }
}

async function findUserByEmail(env: Env, email: string) {
  return env.DB.prepare(
    'select email, pseudo, status from users where lower(email) = ?1 limit 1'
  )
    .bind(normalizeEmail(email))
    .first<{ email: string; pseudo: string | null; status: string | null }>()
}

async function createPendingUser(env: Env, email: string) {
  const now = new Date().toISOString()
  await env.DB.prepare(
    `insert into users (id, email, status, created_at, updated_at)
     values (?1, ?2, 'PENDING', ?3, ?3)
     on conflict(email) do nothing`
  )
    .bind(crypto.randomUUID(), normalizeEmail(email), now)
    .run()
}

export async function requireAuth(
  request: Request,
  env: Env,
  options?: { allowPendingCreate?: boolean; allowBareEmail?: boolean }
): Promise<AuthOutcome> {
  const authValue = getAuthValue(request)
  if (!authValue) {
    return {
      ok: false,
      response: fail('AUTH_REQUIRED', 'Authentication required', 401),
    }
  }

  let email = ''
  if (authValue.startsWith('Session ')) {
    const verifiedEmail = await verifySessionToken(env, authValue.slice(8))
    if (!verifiedEmail) {
      return {
        ok: false,
        response: fail('INVALID_TOKEN', 'Session expired or invalid, please sign in again', 401),
      }
    }
    email = verifiedEmail
  } else if (authValue.startsWith('Email ') && options?.allowBareEmail) {
    // Bare, unsigned email claim - only trusted as a one-time bootstrap credential
    // (auth/check) to obtain a signed session token. Every other route requires
    // "Session <token>"; a bare Email claim there is rejected below.
    email = normalizeEmail(authValue.slice(6))
  } else if (authValue.startsWith('Email ')) {
    return {
      ok: false,
      response: fail('INVALID_TOKEN', 'Bare email auth is no longer accepted - sign in again to obtain a session', 401),
    }
  } else {
    return {
      ok: false,
      response: fail('INVALID_TOKEN', 'Unsupported auth scheme', 401),
    }
  }

  if (!email) {
    return {
      ok: false,
      response: fail('AUTH_REQUIRED', 'Authentication required', 401),
    }
  }

  let user = await findUserByEmail(env, email)
  if (!user && options?.allowPendingCreate) {
    await createPendingUser(env, email)
    user = await findUserByEmail(env, email)
  }

  if (!user || String(user.status || '').toUpperCase() !== 'ACTIVE') {
    return {
      ok: false,
      response: fail('FORBIDDEN', 'User not authorized', 403),
    }
  }

  return {
    ok: true,
    user: {
      email: user.email,
      name: user.pseudo || user.email.split('@')[0],
    },
  }
}
