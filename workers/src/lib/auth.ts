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

export async function requireAuth(request: Request, env: Env, options?: { allowPendingCreate?: boolean }): Promise<AuthOutcome> {
  const authValue = getAuthValue(request)
  if (!authValue) {
    return {
      ok: false,
      response: fail('AUTH_REQUIRED', 'Authentication required', 401),
    }
  }

  if (!authValue.startsWith('Email ')) {
    return {
      ok: false,
      response: fail('INVALID_TOKEN', 'Only Email auth is supported in Worker preparation mode', 401),
    }
  }

  const email = normalizeEmail(authValue.slice(6))
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
