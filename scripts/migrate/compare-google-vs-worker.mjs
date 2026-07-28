#!/usr/bin/env node

import process from 'node:process'

function getArg(name, fallback = '') {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  return process.argv[index + 1] || fallback
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/$/, '')
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep)
  }
  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      acc[key] = sortKeysDeep(value[key])
      return acc
    }, {})
}

function stripFields(value, ignoredKeys) {
  if (Array.isArray(value)) {
    return value.map((item) => stripFields(item, ignoredKeys))
  }
  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.entries(value).reduce((acc, [key, nested]) => {
    if (ignoredKeys.has(key)) {
      return acc
    }
    acc[key] = stripFields(nested, ignoredKeys)
    return acc
  }, {})
}

function stringifyComparable(value, ignoredKeys) {
  return JSON.stringify(sortKeysDeep(stripFields(value, ignoredKeys)), null, 2)
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body || {}),
  })

  const text = await response.text()
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = { parse_error: true, raw: text }
  }

  return {
    status: response.status,
    body: parsed,
  }
}

function buildGoogleUrl(baseUrl, path, auth, params = {}) {
  const url = new URL(baseUrl)
  url.searchParams.set('path', path)
  if (auth) {
    url.searchParams.set('auth', `Email ${auth}`)
  }
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

function buildWorkerUrl(baseUrl, path, authHeaderValue, params = {}) {
  const url = new URL(baseUrl)
  url.searchParams.set('path', path)
  if (authHeaderValue) {
    url.searchParams.set('auth', authHeaderValue)
  }
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

async function fetchWorkerSessionToken(baseUrl, authEmail) {
  const url = buildWorkerUrl(baseUrl, 'auth/check', `Email ${authEmail}`)
  const result = await postJson(url, {})
  return result.body?.data?.session_token || null
}

const googleBaseUrl = normalizeBaseUrl(getArg('--google', process.env.GOOGLE_BACKEND_URL))
const workerBaseUrl = normalizeBaseUrl(getArg('--worker', process.env.WORKER_BASE_URL))
const authEmail = getArg('--auth-email', process.env.MIGRATION_AUTH_EMAIL)

if (!googleBaseUrl || !workerBaseUrl || !authEmail) {
  process.stderr.write(
    'Usage: node scripts/migrate/compare-google-vs-worker.mjs --google <url> --worker <url> --auth-email <email>\n'
  )
  process.exit(1)
}

const ignoredKeys = new Set([
  'request_id',
  'url',
  'file_id',
  'pdf_url',
  'avatar_base64',
])

const scenarios = [
  { name: 'auth/check', path: 'auth/check' },
  { name: 'users/list', path: 'users/list' },
  { name: 'profile/get', path: 'profile/get' },
  { name: 'articles/list', path: 'articles/list', params: { limit: '5', status_filter: 'active' } },
  { name: 'articles/authors', path: 'articles/authors', params: { status_filter: 'all' } },
  { name: 'famileo/families', path: 'famileo/families' },
  { name: 'famileo/imported-ids', path: 'famileo/imported-ids' },
  { name: 'famileo/imported-fingerprints', path: 'famileo/imported-fingerprints' },
  { name: 'config/get family_name', path: 'config/get', params: { key: 'family_name' } },
  { name: 'logs/pdf/range', path: 'logs/pdf/range' },
  { name: 'logs/famileo/range', path: 'logs/famileo/range' },
  { name: 'pdf/list', path: 'pdf/list', params: { include_in_progress: 'true' } },
  { name: 'pdf/merge-token-status', path: 'pdf/merge-token-status' },
  { name: 'famileo/status', path: 'famileo/status' },
]

const workerSessionToken = await fetchWorkerSessionToken(workerBaseUrl, authEmail)
const workerAuthHeader = workerSessionToken ? `Session ${workerSessionToken}` : `Email ${authEmail}`
if (!workerSessionToken) {
  process.stdout.write(
    '\nWarning: could not obtain a Worker session token (AUTH_SECRET not configured on the target?) - falling back to bare Email auth, which the Worker now rejects on every route except auth/check.\n'
  )
}

let failures = 0

for (const scenario of scenarios) {
  const googleUrl = buildGoogleUrl(googleBaseUrl, scenario.path, authEmail, scenario.params)
  const workerUrl = buildWorkerUrl(workerBaseUrl, scenario.path, workerAuthHeader, scenario.params)

  const [googleResult, workerResult] = await Promise.all([
    postJson(googleUrl, scenario.body || {}),
    postJson(workerUrl, scenario.body || {}),
  ])

  const sameStatus = googleResult.status === workerResult.status
  const googleComparable = stringifyComparable(googleResult.body, ignoredKeys)
  const workerComparable = stringifyComparable(workerResult.body, ignoredKeys)
  const sameBody = googleComparable === workerComparable

  const ok = sameStatus && sameBody
  if (!ok) failures += 1

  process.stdout.write(`\n[${ok ? 'OK' : 'DIFF'}] ${scenario.name}\n`)
  process.stdout.write(`  Google status: ${googleResult.status}\n`)
  process.stdout.write(`  Worker status: ${workerResult.status}\n`)

  if (!sameBody) {
    process.stdout.write('  Google body:\n')
    process.stdout.write(`${googleComparable}\n`)
    process.stdout.write('  Worker body:\n')
    process.stdout.write(`${workerComparable}\n`)
  }
}

process.stdout.write(`\nCompleted with ${failures} differing scenario(s).\n`)
process.exit(failures === 0 ? 0 : 2)
