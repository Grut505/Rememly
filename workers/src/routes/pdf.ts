import { requireAuth } from '../lib/auth'
import { logEvent } from '../lib/logs'
import { readJson } from '../lib/request'
import { fail, ok } from '../lib/response'
import type { RouteHandler } from '../lib/router'
import type { Env } from '../types'

interface PdfCreateBody {
  from?: string
  to?: string
  options?: Record<string, unknown>
}

async function getPdfJob(db: D1Database, jobId: string) {
  return db.prepare('select * from jobs_pdf where job_id = ?1 limit 1').bind(jobId).first<Record<string, unknown>>()
}

// Whether a job is a Blurb print-ready generation is decided once, at
// creation, and already lives in options_json - there's no need for a
// dedicated column, just surface it explicitly instead of leaving callers to
// parse options_json themselves.
function isBlurbJob(job: Record<string, unknown>): boolean {
  try {
    const options = JSON.parse((job.options_json as string) || '{}')
    return Boolean(options && options.blurb_mode_enabled)
  } catch {
    return false
  }
}

function withBlurbFlag(job: Record<string, unknown>): Record<string, unknown> {
  return { ...job, is_blurb: isBlurbJob(job) }
}

function currentIso() {
  return new Date().toISOString()
}

async function getGdriveTokenState(env: Env) {
  const rows = await env.DB.prepare(
    `select key, value from config where key in ('gdrive_access_token', 'gdrive_token_expiry')`
  ).all<{ key: string; value: string | null }>()
  const map = new Map((rows.results || []).map((row) => [row.key, row.value]))
  return {
    token: map.get('gdrive_access_token') || null,
    expiry: map.get('gdrive_token_expiry') || null,
  }
}

async function setGdriveTokenState(env: Env, token: string, expiry: string) {
  const now = new Date().toISOString()
  const entries: Array<[string, string]> = [
    ['gdrive_access_token', token],
    ['gdrive_token_expiry', expiry],
  ]
  for (const [key, value] of entries) {
    await env.DB.prepare(
      `insert into config (key, value, updated_at) values (?1, ?2, ?3)
       on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at`
    )
      .bind(key, value, now)
      .run()
  }
}

type GdriveTokenResult = { ok: true; token: string; expiry: string } | { ok: false; code: string; message: string }

async function refreshGdriveToken(env: Env): Promise<GdriveTokenResult> {
  const { GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN } = env
  if (!GDRIVE_CLIENT_ID || !GDRIVE_CLIENT_SECRET || !GDRIVE_REFRESH_TOKEN) {
    return { ok: false, code: 'NOT_CONFIGURED', message: 'Google Drive OAuth credentials are not configured' }
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GDRIVE_CLIENT_ID,
      client_secret: GDRIVE_CLIENT_SECRET,
      refresh_token: GDRIVE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { ok: false, code: 'TOKEN_REFRESH_FAILED', message: `Google token refresh failed: HTTP ${response.status} ${text}` }
  }

  const data = await response.json<{ access_token: string; expires_in: number }>()
  const expiry = new Date(Date.now() + data.expires_in * 1000).toISOString()
  await setGdriveTokenState(env, data.access_token, expiry)
  return { ok: true, token: data.access_token, expiry }
}

export const pdfCreateHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) return auth.response

  const body = await readJson<PdfCreateBody>(request)
  if (!body.from || !body.to) {
    return fail('INVALID_PARAMS', 'from and to are required', 400)
  }

  const jobId = crypto.randomUUID()
  const optionsJson = JSON.stringify(body.options || {})
  await context.env.DB.prepare(
    `insert into jobs_pdf (
       job_id, status, progress, progress_message, created_at, created_by, created_by_pseudo,
       date_from, date_to, error_message, options_json
     ) values (?1, 'PENDING', 0, 'Pending...', ?2, ?3, ?4, ?5, ?6, '', ?7)`
  )
    .bind(jobId, currentIso(), auth.user.email, auth.user.name, body.from, body.to, optionsJson)
    .run()

  await logEvent(context.env, 'pdf', 'INFO', 'Job created', {
    job_id: jobId,
    created_by: auth.user.email,
    date_from: body.from,
    date_to: body.to,
  })

  return ok({
    job_id: jobId,
    status: 'PENDING',
    progress: 0,
    progress_message: 'Pending...',
    options: body.options || {},
  })
}

async function dispatchGithubWorkflow(
  env: Env,
  workflowFile: string,
  inputs: Record<string, string>
): Promise<{ ok: true } | { ok: false; code: string; message: string; detail?: string }> {
  const githubToken = env.GITHUB_TOKEN
  if (!githubToken) {
    return { ok: false, code: 'NOT_CONFIGURED', message: 'GitHub token not configured' }
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/Grut505/Rememly/actions/workflows/${workflowFile}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Rememly-Worker',
        },
        body: JSON.stringify({ ref: 'main', inputs }),
      }
    )

    if (response.status !== 204) {
      const responseText = await response.text()
      let errorCode = 'GITHUB_ERROR'
      let errorMessage = `The ${workflowFile} workflow could not be started due to a GitHub error.`

      if (response.status === 401) {
        errorCode = 'GITHUB_TOKEN_INVALID'
        errorMessage =
          'PDF generation is temporarily unavailable because the server GitHub token is expired, revoked, or invalid. Please contact an administrator.'
      } else if (response.status === 403) {
        errorCode = 'GITHUB_TOKEN_FORBIDDEN'
        errorMessage =
          'PDF generation is temporarily unavailable because the server GitHub token does not have permission to run the workflow. Please contact an administrator.'
      } else if (response.status === 404) {
        errorCode = 'GITHUB_WORKFLOW_NOT_FOUND'
        errorMessage = `PDF generation is temporarily unavailable because the ${workflowFile} workflow could not be found or accessed.`
      }

      return { ok: false, code: errorCode, message: errorMessage, detail: responseText }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown trigger error'
    return { ok: false, code: 'TRIGGER_ERROR', message }
  }

  return { ok: true }
}

async function triggerPdfMerge(env: Env, jobId: string, folderId: string, cleanChunks: boolean) {
  return dispatchGithubWorkflow(env, 'pdf-merge.yml', {
    job_id: jobId,
    folder_id: folderId,
    clean_chunks: cleanChunks === false ? 'false' : 'true',
  })
}

export const pdfProcessHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const jobId = url.searchParams.get('job_id')
  if (!jobId) return fail('INVALID_PARAMS', 'job_id is required', 400)

  const job = await getPdfJob(context.env.DB, jobId)
  if (!job) return fail('NOT_FOUND', 'Job not found', 404)

  const dispatchResult = await dispatchGithubWorkflow(context.env, 'pdf-render.yml', { job_id: jobId })
  if (!dispatchResult.ok) {
    await logEvent(context.env, 'pdf', 'ERROR', 'Render workflow dispatch failed', {
      job_id: jobId,
      code: dispatchResult.code,
      message: dispatchResult.message,
    })
    return fail(dispatchResult.code, dispatchResult.message, 502, dispatchResult.detail)
  }

  await context.env.DB.prepare(
    `update jobs_pdf set status = 'RUNNING', progress = 5, progress_message = 'Preparation queued' where job_id = ?1`
  )
    .bind(jobId)
    .run()

  await logEvent(context.env, 'pdf', 'INFO', 'Render workflow dispatched', { job_id: jobId })

  return ok({ queued: true, job_id: jobId, status: 'RUNNING', progress: 5, progress_message: 'Preparation queued' })
}

export const pdfRenderJobHandler: RouteHandler = async (request, context) => {
  const params = new URL(request.url).searchParams
  const token = params.get('token')
  if (!context.env.PDF_MERGE_TOKEN || token !== context.env.PDF_MERGE_TOKEN) {
    return fail('FORBIDDEN', 'Invalid token', 403)
  }

  const jobId = params.get('job_id')
  if (!jobId) return fail('INVALID_PARAMS', 'job_id is required', 400)

  const job = await getPdfJob(context.env.DB, jobId)
  if (!job) return fail('NOT_FOUND', 'Job not found', 404)

  const articles = await context.env.DB.prepare(
    `select id, date, auteur, author_pseudo, texte, image_url, image_file_id
       from articles
      where status = 'ACTIVE' and (deleted_at is null or deleted_at = '') and date >= ?1 and date <= ?2
      order by date asc`
  )
    .bind(job.date_from, job.date_to)
    .all<Record<string, unknown>>()

  const configRows = await context.env.DB.prepare('select key, value from config').all<{ key: string; value: string | null }>()
  const config = Object.fromEntries((configRows.results || []).map((row) => [row.key, row.value]))

  return ok({ job, articles: articles.results || [], config })
}

export const pdfRenderImageHandler: RouteHandler = async (request, context) => {
  const params = new URL(request.url).searchParams
  const token = params.get('token')
  if (!context.env.PDF_MERGE_TOKEN || token !== context.env.PDF_MERGE_TOKEN) {
    return fail('FORBIDDEN', 'Invalid token', 403)
  }

  const fileId = params.get('file_id')
  if (!fileId) return fail('INVALID_PARAMS', 'file_id is required', 400)

  if (fileId.includes('/')) {
    // Images uploaded through the Worker are stored in R2 under a path-like key
    // (e.g. articles/{id}/original/...), unlike opaque Google Drive file IDs.
    const object = await context.env.FILES.get(fileId)
    if (!object) return fail('NOT_FOUND', 'Image not found in R2', 404)
    return new Response(object.body, {
      headers: { 'content-type': object.httpMetadata?.contentType || 'application/octet-stream' },
    })
  }

  const response = await fetch(`https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w2000`)
  if (response.status !== 200) {
    return fail('FETCH_ERROR', `Failed to fetch image from Drive: HTTP ${response.status}`, 502)
  }
  return new Response(response.body, {
    headers: { 'content-type': response.headers.get('content-type') || 'image/jpeg' },
  })
}

export const pdfRenderStatusHandler: RouteHandler = async (request, context) => {
  const params = new URL(request.url).searchParams
  const token = params.get('token')
  if (!context.env.PDF_MERGE_TOKEN || token !== context.env.PDF_MERGE_TOKEN) {
    return fail('FORBIDDEN', 'Invalid token', 403)
  }

  const jobId = params.get('job_id')
  const progressRaw = params.get('progress')
  const message = params.get('message')
  if (!jobId || progressRaw === null || message === null) {
    return fail('INVALID_PARAMS', 'Missing params', 400)
  }

  const job = await getPdfJob(context.env.DB, jobId)
  if (!job) return fail('NOT_FOUND', 'Job not found', 404)

  await context.env.DB.prepare(
    `update jobs_pdf set status = 'RUNNING', progress = ?2, progress_message = ?3 where job_id = ?1`
  )
    .bind(jobId, Number(progressRaw), message)
    .run()

  return ok({ ok: true })
}

export const pdfRenderCompleteHandler: RouteHandler = async (request, context) => {
  const params = new URL(request.url).searchParams
  const token = params.get('token')
  if (!context.env.PDF_MERGE_TOKEN || token !== context.env.PDF_MERGE_TOKEN) {
    return fail('FORBIDDEN', 'Invalid token', 403)
  }

  const jobId = params.get('job_id')
  const folderId = params.get('folder_id')
  const folderUrl = params.get('folder_url')
  const chunksCount = Number(params.get('chunks_count') || '0') || 0
  if (!jobId || !folderId) {
    return fail('INVALID_PARAMS', 'Missing params', 400)
  }

  const job = await getPdfJob(context.env.DB, jobId)
  if (!job) return fail('NOT_FOUND', 'Job not found', 404)

  await context.env.DB.prepare(
    `update jobs_pdf set chunks_folder_id = ?2, chunks_folder_url = ?3, chunks_count = ?4 where job_id = ?1`
  )
    .bind(jobId, folderId, chunksCount > 0 ? folderUrl || '' : '', chunksCount)
    .run()

  let options: Record<string, unknown> = {}
  try {
    options = JSON.parse((job.options_json as string) || '{}')
  } catch {
    options = {}
  }

  if (options.auto_merge) {
    const tokenResult = await refreshGdriveToken(context.env)
    if (!tokenResult.ok) {
      await context.env.DB.prepare(
        `update jobs_pdf set status = 'ERROR', progress_message = 'Merge trigger failed', error_message = ?2 where job_id = ?1`
      )
        .bind(jobId, tokenResult.message)
        .run()
      return fail(tokenResult.code, tokenResult.message, 502)
    }

    const mergeResult = await triggerPdfMerge(context.env, jobId, folderId, options.clean_chunks !== false)
    if (!mergeResult.ok) {
      await context.env.DB.prepare(
        `update jobs_pdf set status = 'ERROR', progress_message = 'Merge trigger failed', error_message = ?2 where job_id = ?1`
      )
        .bind(jobId, mergeResult.message)
        .run()
      return fail(mergeResult.code, mergeResult.message, 502, mergeResult.detail)
    }

    // Continue from wherever rendering left off (capped below 80) instead of
    // resetting to a low number - pdf-merge.yml's own status updates start
    // around 84, so this keeps progress monotonic through the handoff.
    await context.env.DB.prepare(
      `update jobs_pdf set status = 'RUNNING', progress = max(progress, 80), progress_message = 'Merge queued' where job_id = ?1`
    )
      .bind(jobId)
      .run()

    return ok({ ok: true, merge_queued: true })
  }

  await context.env.DB.prepare(
    `update jobs_pdf set status = 'DONE', progress = 100, progress_message = 'Chunks ready (merge pending)' where job_id = ?1`
  )
    .bind(jobId)
    .run()

  return ok({ ok: true, merge_queued: false })
}

export const pdfRenderFailedHandler: RouteHandler = async (request, context) => {
  const params = new URL(request.url).searchParams
  const token = params.get('token')
  if (!context.env.PDF_MERGE_TOKEN || token !== context.env.PDF_MERGE_TOKEN) {
    return fail('FORBIDDEN', 'Invalid token', 403)
  }

  const jobId = params.get('job_id')
  if (!jobId) {
    return fail('INVALID_PARAMS', 'Missing job_id', 400)
  }

  const message = params.get('message') || 'Preparation failed'
  await context.env.DB.prepare(
    `update jobs_pdf set status = 'ERROR', progress = 0, progress_message = 'Preparation failed', error_message = ?2 where job_id = ?1`
  )
    .bind(jobId, message)
    .run()

  await logEvent(context.env, 'pdf', 'ERROR', 'Render failed', { job_id: jobId, message })

  return ok({ ok: true })
}

export const pdfStatusHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) return auth.response

  const jobId = new URL(request.url).searchParams.get('job_id')
  if (!jobId) return fail('INVALID_PARAMS', 'job_id is required', 400)

  const job = await getPdfJob(context.env.DB, jobId)
  if (!job) return fail('NOT_FOUND', 'Job not found', 404)
  return ok(withBlurbFlag(job))
}

export const pdfListHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const dateFrom = url.searchParams.get('date_from')
  const dateTo = url.searchParams.get('date_to')
  const author = url.searchParams.get('author')
  const includeInProgress = url.searchParams.get('include_in_progress') === 'true'
  const conditions = [includeInProgress ? "status in ('PENDING','RUNNING','DONE','ERROR','CANCELLED')" : "status in ('DONE','ERROR','CANCELLED')"]
  const bindings: string[] = []

  if (author) {
    conditions.push(`created_by = ?${bindings.length + 1}`)
    bindings.push(author)
  }
  if (dateFrom) {
    conditions.push(`created_at >= ?${bindings.length + 1}`)
    bindings.push(dateFrom)
  }
  if (dateTo) {
    conditions.push(`created_at < ?${bindings.length + 1}`)
    bindings.push(`${dateTo}T23:59:59.999Z`)
  }

  const items = await context.env.DB.prepare(
    `select * from jobs_pdf where ${conditions.join(' and ')} order by created_at desc`
  )
    .bind(...bindings)
    .all<Record<string, unknown>>()

  const authors = await context.env.DB.prepare(
    `select distinct created_by from jobs_pdf where status in ('DONE','ERROR') and coalesce(created_by, '') != '' order by created_by asc`
  ).all<{ created_by: string }>()

  return ok({
    items: (items.results || []).map(withBlurbFlag),
    authors: (authors.results || []).map((row) => row.created_by),
  })
}

export const pdfDeleteHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) return auth.response

  const body = await readJson<{ job_id?: string }>(request)
  if (!body.job_id) return fail('MISSING_JOB_ID', 'Job ID is required', 400)

  const job = await getPdfJob(context.env.DB, body.job_id)
  const pdfFileId = job?.pdf_file_id as string | null | undefined
  const chunksFolderId = job?.chunks_folder_id as string | null | undefined

  // Deleting the job here only ever removed the D1 row - the merged PDF and
  // the raw chunks folder stayed on Drive forever. Trash both (best-effort:
  // a Drive hiccup shouldn't block removing the job from the list).
  if (pdfFileId || chunksFolderId) {
    const tokenResult = await refreshGdriveToken(context.env)
    if (tokenResult.ok) {
      if (pdfFileId) await driveTrashFolder(tokenResult.token, pdfFileId).catch(() => false)
      if (chunksFolderId) await driveTrashFolder(tokenResult.token, chunksFolderId).catch(() => false)
    } else {
      await logEvent(context.env, 'pdf', 'ERROR', 'Delete: could not refresh Drive token to trash assets', {
        job_id: body.job_id,
        code: tokenResult.code,
      })
    }
  }

  await context.env.DB.prepare('delete from jobs_pdf where job_id = ?1').bind(body.job_id).run()
  return ok({ deleted: true })
}

export const pdfCancelHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) return auth.response

  const body = await readJson<{ job_id?: string }>(request)
  if (!body.job_id) return fail('INVALID_PARAMS', 'job_id is required', 400)

  await context.env.DB.prepare(
    `update jobs_pdf set status = 'CANCELLED', progress_message = 'Cancelled' where job_id = ?1`
  )
    .bind(body.job_id)
    .run()

  return ok({ cancelled: true })
}

export const pdfMergeTriggerHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) return auth.response

  const body = await readJson<{ job_id?: string; clean_chunks?: boolean }>(request)
  if (!body.job_id) return fail('INVALID_PARAMS', 'Missing job_id', 400)

  const job = await getPdfJob(context.env.DB, body.job_id)
  if (!job) return fail('NOT_FOUND', 'Job not found', 404)

  const folderId = job.chunks_folder_id as string | null
  if (!folderId) {
    return fail('MISSING_CHUNKS_FOLDER', 'Job has no rendered chunks folder yet', 400)
  }

  const tokenResult = await refreshGdriveToken(context.env)
  if (!tokenResult.ok) {
    return fail(tokenResult.code, tokenResult.message, 502)
  }

  const dispatchResult = await triggerPdfMerge(context.env, body.job_id, folderId, body.clean_chunks !== false)
  if (!dispatchResult.ok) {
    await logEvent(context.env, 'pdf', 'ERROR', 'Merge workflow dispatch failed', {
      job_id: body.job_id,
      code: dispatchResult.code,
      message: dispatchResult.message,
    })
    return fail(dispatchResult.code, dispatchResult.message, 502, dispatchResult.detail)
  }

  await context.env.DB.prepare(
    `update jobs_pdf set status = 'RUNNING', progress = 10, progress_message = 'Merge queued' where job_id = ?1`
  )
    .bind(body.job_id)
    .run()

  await logEvent(context.env, 'pdf', 'INFO', 'Merge workflow dispatched', { job_id: body.job_id })

  return ok({ queued: true })
}

export const pdfMergeTokenHandler: RouteHandler = async (request, context) => {
  const token = new URL(request.url).searchParams.get('token')
  if (!context.env.PDF_MERGE_TOKEN || token !== context.env.PDF_MERGE_TOKEN) {
    return fail('FORBIDDEN', 'Invalid token', 403)
  }

  const { GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN } = context.env
  if (!GDRIVE_CLIENT_ID || !GDRIVE_CLIENT_SECRET || !GDRIVE_REFRESH_TOKEN) {
    return fail('NOT_CONFIGURED', 'Google Drive OAuth credentials are not configured', 400)
  }

  const state = await getGdriveTokenState(context.env)
  const tokenJson = {
    client_id: GDRIVE_CLIENT_ID,
    client_secret: GDRIVE_CLIENT_SECRET,
    refresh_token: GDRIVE_REFRESH_TOKEN,
    token_uri: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/drive'],
    token: state.token,
    expiry: state.expiry,
  }

  return ok({ token_json: JSON.stringify(tokenJson) })
}

export const pdfMergeTokenStatusHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) return auth.response

  const { GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN } = context.env
  const configured = !!(GDRIVE_CLIENT_ID && GDRIVE_CLIENT_SECRET && GDRIVE_REFRESH_TOKEN)
  if (!configured) {
    return ok({ configured: false })
  }

  const state = await getGdriveTokenState(context.env)
  return ok({
    configured: true,
    has_refresh_token: !!GDRIVE_REFRESH_TOKEN,
    has_access_token: !!state.token,
    expiry: state.expiry || '',
    client_id_suffix: GDRIVE_CLIENT_ID.slice(-8),
  })
}

export const pdfMergeTokenRefreshHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) return auth.response

  const result = await refreshGdriveToken(context.env)
  if (!result.ok) {
    return fail(result.code, result.message, 502)
  }

  return ok({
    refreshed: true,
    expiry: result.expiry,
    has_refresh_token: !!context.env.GDRIVE_REFRESH_TOKEN,
  })
}

export const pdfMergeStatusHandler: RouteHandler = async (request, context) => {
  const params = new URL(request.url).searchParams
  const token = params.get('token')
  if (!context.env.PDF_MERGE_TOKEN || token !== context.env.PDF_MERGE_TOKEN) {
    return fail('FORBIDDEN', 'Invalid token', 403)
  }

  const jobId = params.get('job_id')
  const progressRaw = params.get('progress')
  const message = params.get('message')
  if (!jobId || progressRaw === null || message === null) {
    return fail('INVALID_PARAMS', 'Missing params', 400)
  }

  const job = await getPdfJob(context.env.DB, jobId)
  if (!job) {
    return fail('NOT_FOUND', 'Job not found', 404)
  }

  await context.env.DB.prepare(
    `update jobs_pdf set status = 'RUNNING', progress = ?2, progress_message = ?3 where job_id = ?1`
  )
    .bind(jobId, Number(progressRaw), message)
    .run()

  return ok({ ok: true })
}

export const pdfMergeCompleteHandler: RouteHandler = async (request, context) => {
  const params = new URL(request.url).searchParams
  const token = params.get('token')
  if (!context.env.PDF_MERGE_TOKEN || token !== context.env.PDF_MERGE_TOKEN) {
    return fail('FORBIDDEN', 'Invalid token', 403)
  }

  const jobId = params.get('job_id')
  const fileId = params.get('file_id')
  const pdfUrl = params.get('url')
  if (!jobId || !fileId || !pdfUrl) {
    return fail('INVALID_PARAMS', 'Missing params', 400)
  }

  const job = await getPdfJob(context.env.DB, jobId)
  if (!job) {
    return fail('NOT_FOUND', 'Job not found', 404)
  }

  await context.env.DB.prepare(
    `update jobs_pdf
        set status = 'DONE', progress = 100, progress_message = 'Merged', pdf_file_id = ?2, pdf_url = ?3, error_message = ''
      where job_id = ?1`
  )
    .bind(jobId, fileId, pdfUrl)
    .run()

  await logEvent(context.env, 'pdf', 'INFO', 'Merge complete', { job_id: jobId, file_id: fileId, url: pdfUrl })

  return ok({ ok: true })
}

export const pdfMergeFailedHandler: RouteHandler = async (request, context) => {
  const params = new URL(request.url).searchParams
  const token = params.get('token')
  if (!context.env.PDF_MERGE_TOKEN || token !== context.env.PDF_MERGE_TOKEN) {
    return fail('FORBIDDEN', 'Invalid token', 403)
  }

  const jobId = params.get('job_id')
  if (!jobId) {
    return fail('INVALID_PARAMS', 'Missing job_id', 400)
  }

  const message = params.get('message') || 'Merge failed'
  await context.env.DB.prepare(
    `update jobs_pdf set status = 'ERROR', progress = 0, progress_message = 'Merge failed', error_message = ?2 where job_id = ?1`
  )
    .bind(jobId, message)
    .run()

  await logEvent(context.env, 'pdf', 'ERROR', 'Merge failed', { job_id: jobId, message })

  return ok({ ok: true })
}

async function driveFindFolder(accessToken: string, name: string, parentId: string | null): Promise<string | null> {
  const parentClause = parentId ? `'${parentId}' in parents and ` : ''
  const q = `${parentClause}name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) return null
  const data = await res.json<{ files?: Array<{ id: string }> }>()
  return data.files && data.files[0] ? data.files[0].id : null
}

async function driveCreateFolder(accessToken: string, name: string, parentId: string | null): Promise<string | null> {
  const body: Record<string, unknown> = { name, mimeType: 'application/vnd.google-apps.folder' }
  if (parentId) body.parents = [parentId]
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) return null
  const data = await res.json<{ id: string }>()
  return data.id
}

async function driveFindOrCreateFolder(accessToken: string, name: string, parentId: string | null): Promise<string | null> {
  const existing = await driveFindFolder(accessToken, name, parentId)
  if (existing) return existing
  return driveCreateFolder(accessToken, name, parentId)
}

async function driveGetFileParents(accessToken: string, fileId: string): Promise<string[]> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return []
  const data = await res.json<{ parents?: string[] }>()
  return data.parents || []
}

async function driveMoveFile(accessToken: string, fileId: string, newParentId: string): Promise<boolean> {
  const parents = await driveGetFileParents(accessToken, fileId)
  const params = new URLSearchParams({ addParents: newParentId, removeParents: parents.join(',') })
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?${params.toString()}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  return res.ok
}

async function driveTrashFolder(accessToken: string, folderId: string): Promise<boolean> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  })
  return res.ok
}

export const pdfMergeCleanupJobHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) return auth.response

  const body = await readJson<{ job_id?: string }>(request)
  if (!body.job_id) return fail('INVALID_PARAMS', 'Missing job_id', 400)

  const job = await getPdfJob(context.env.DB, body.job_id)
  if (!job) return fail('NOT_FOUND', 'Job not found', 404)

  if (!job.pdf_file_id || !job.pdf_url) {
    return fail('MISSING_MERGED_PDF', 'Merged PDF not found', 400)
  }
  const folderId = job.chunks_folder_id as string | null
  if (!folderId) {
    return fail('NO_CHUNKS_FOLDER', 'No chunks folder to clean', 400)
  }

  const tokenResult = await refreshGdriveToken(context.env)
  if (!tokenResult.ok) {
    return fail(tokenResult.code, tokenResult.message, 502)
  }

  const rememlyId = await driveFindOrCreateFolder(tokenResult.token, 'Rememly', null)
  const pdfRootId = rememlyId ? await driveFindOrCreateFolder(tokenResult.token, 'pdf', rememlyId) : null
  if (pdfRootId) {
    await driveMoveFile(tokenResult.token, job.pdf_file_id as string, pdfRootId)
  }
  await driveTrashFolder(tokenResult.token, folderId)

  await context.env.DB.prepare(
    `update jobs_pdf set chunks_folder_id = '', chunks_folder_url = '', chunks_count = 0, progress_message = 'Chunks cleaned' where job_id = ?1`
  )
    .bind(body.job_id)
    .run()

  return ok({ cleaned: true })
}

function arrayBufferToBase64Pdf(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function base64ToUint8ArrayPdf(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export const pdfCoverPreviewHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) return auth.response

  const body = await readJson<{ from?: string; to?: string; options?: Record<string, unknown> }>(request)
  const previewId = crypto.randomUUID()
  const optionsJson = JSON.stringify(body.options || {})
  const now = new Date().toISOString()

  await context.env.DB.prepare(
    `insert into pdf_previews (id, status, options_json, created_by, created_at, updated_at)
     values (?1, 'PENDING', ?2, ?3, ?4, ?4)`
  )
    .bind(previewId, optionsJson, auth.user.email, now)
    .run()

  const dispatchResult = await dispatchGithubWorkflow(context.env, 'pdf-preview.yml', { preview_id: previewId })
  if (!dispatchResult.ok) {
    await context.env.DB.prepare(
      `update pdf_previews set status = 'ERROR', error_message = ?2, updated_at = ?3 where id = ?1`
    )
      .bind(previewId, dispatchResult.message, new Date().toISOString())
      .run()
    return fail(dispatchResult.code, dispatchResult.message, 502, dispatchResult.detail)
  }

  await context.env.DB.prepare(
    `update pdf_previews set status = 'RUNNING', updated_at = ?2 where id = ?1`
  )
    .bind(previewId, new Date().toISOString())
    .run()

  return ok({ file_id: previewId, url: '' })
}

export const pdfArticlePreviewHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) return auth.response

  const body = await readJson<{
    start_date?: string
    article?: {
      id?: string
      date?: string
      texte?: string
      image_file_id?: string
      image?: { base64: string; mimeType?: string }
    }
  }>(request)

  if (!body.start_date || !body.article?.date) {
    return fail('INVALID_PARAMS', 'start_date and article.date are required', 400)
  }

  const previewId = crypto.randomUUID()

  // The article being previewed may be brand new or a still-unsaved Draft
  // (which real generation would never include) - rather than requiring it
  // to already exist as an ACTIVE row, the editor sends its current
  // in-progress content/photo directly. A changed-but-unsaved photo gets
  // uploaded here under a preview-scoped key (cleaned up alongside the
  // rendered PDF by pdfCoverPreviewDeleteHandler, reused as-is for article
  // previews too); an unchanged photo just reuses its existing file id.
  let imageFileId = body.article.image_file_id || ''
  if (body.article.image?.base64) {
    const key = `previews/${previewId}/photo.jpg`
    await context.env.FILES.put(key, base64ToUint8ArrayPdf(body.article.image.base64), {
      httpMetadata: { contentType: body.article.image.mimeType || 'image/jpeg' },
    })
    imageFileId = key
  }

  // Reuses the generic pdf_previews table/pipeline (status/content/delete
  // handlers below are all preview-type-agnostic) - options_json just
  // carries what render_article_preview.py needs instead of cover styling.
  const optionsJson = JSON.stringify({
    start_date: body.start_date,
    target_article: {
      id: body.article.id || '',
      date: body.article.date,
      texte: body.article.texte || '',
      image_file_id: imageFileId,
    },
  })
  const now = new Date().toISOString()

  await context.env.DB.prepare(
    `insert into pdf_previews (id, status, options_json, created_by, created_at, updated_at)
     values (?1, 'PENDING', ?2, ?3, ?4, ?4)`
  )
    .bind(previewId, optionsJson, auth.user.email, now)
    .run()

  const dispatchResult = await dispatchGithubWorkflow(context.env, 'pdf-article-preview.yml', { preview_id: previewId })
  if (!dispatchResult.ok) {
    await context.env.DB.prepare(
      `update pdf_previews set status = 'ERROR', error_message = ?2, updated_at = ?3 where id = ?1`
    )
      .bind(previewId, dispatchResult.message, new Date().toISOString())
      .run()
    return fail(dispatchResult.code, dispatchResult.message, 502, dispatchResult.detail)
  }

  await context.env.DB.prepare(
    `update pdf_previews set status = 'RUNNING', updated_at = ?2 where id = ?1`
  )
    .bind(previewId, new Date().toISOString())
    .run()

  return ok({ file_id: previewId })
}

export const pdfArticlePreviewDataHandler: RouteHandler = async (request, context) => {
  const params = new URL(request.url).searchParams
  const token = params.get('token')
  if (!context.env.PDF_MERGE_TOKEN || token !== context.env.PDF_MERGE_TOKEN) {
    return fail('FORBIDDEN', 'Invalid token', 403)
  }

  const previewId = params.get('preview_id')
  if (!previewId) return fail('INVALID_PARAMS', 'preview_id is required', 400)

  const row = await context.env.DB.prepare('select options_json from pdf_previews where id = ?1 limit 1')
    .bind(previewId)
    .first<{ options_json: string }>()
  if (!row) return fail('NOT_FOUND', 'Preview not found', 404)

  let options: {
    start_date?: string
    target_article?: { id?: string; date?: string; texte?: string; image_file_id?: string }
  } = {}
  try {
    options = JSON.parse(row.options_json || '{}')
  } catch {
    options = {}
  }
  const targetArticle = options.target_article
  if (!options.start_date || !targetArticle?.date) {
    return fail('INVALID_PARAMS', 'Preview is missing start_date/target_article', 400)
  }

  // Same "what would actually be in the generated PDF" query real
  // generation uses (see pdfRenderJobHandler) - active, non-deleted, and
  // bounded by the configured preview start date through the target
  // article's own date, so its true page/pairing position can be computed
  // exactly like the real export would. Excludes the target's own id so an
  // already-saved article being previewed isn't counted twice alongside the
  // (possibly edited) in-progress copy supplied in target_article.
  const articles = await context.env.DB.prepare(
    `select id, date, auteur, author_pseudo, texte, image_url, image_file_id
       from articles
      where status = 'ACTIVE' and (deleted_at is null or deleted_at = '')
        and date >= ?1 and date <= ?2
        and id != ?3
      order by date asc`
  )
    .bind(options.start_date, targetArticle.date, targetArticle.id || '__none__')
    .all<Record<string, unknown>>()

  const configRows = await context.env.DB.prepare('select key, value from config').all<{ key: string; value: string | null }>()
  const config = Object.fromEntries((configRows.results || []).map((r) => [r.key, r.value]))

  return ok({
    target_article: targetArticle,
    articles: articles.results || [],
    config,
  })
}

export const pdfPreviewStatusHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) return auth.response

  const previewId = new URL(request.url).searchParams.get('preview_id')
  if (!previewId) return fail('INVALID_PARAMS', 'preview_id is required', 400)

  const row = await context.env.DB.prepare(
    'select id, status, error_message from pdf_previews where id = ?1 limit 1'
  )
    .bind(previewId)
    .first<{ id: string; status: string; error_message: string | null }>()

  if (!row) return fail('NOT_FOUND', 'Preview not found', 404)

  return ok({ status: row.status, error_message: row.error_message || '' })
}

export const pdfCoverPreviewContentHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) return auth.response

  const body = await readJson<{ file_id?: string }>(request)
  if (!body.file_id) return fail('INVALID_PARAMS', 'file_id is required', 400)

  const row = await context.env.DB.prepare(
    'select id, status, r2_key, result_meta from pdf_previews where id = ?1 limit 1'
  )
    .bind(body.file_id)
    .first<{ id: string; status: string; r2_key: string | null; result_meta: string | null }>()

  if (!row) return fail('NOT_FOUND', 'Preview not found', 404)
  if (row.status !== 'DONE' || !row.r2_key) {
    return fail('NOT_READY', 'Preview is not ready yet', 409)
  }

  const object = await context.env.FILES.get(row.r2_key)
  if (!object) return fail('NOT_FOUND', 'Preview file not found', 404)

  let meta: Record<string, unknown> | undefined
  if (row.result_meta) {
    try {
      meta = JSON.parse(row.result_meta)
    } catch {
      meta = undefined
    }
  }

  const buffer = await object.arrayBuffer()
  const mimeType = object.httpMetadata?.contentType || 'application/pdf'
  return ok({ mime_type: mimeType, base64: arrayBufferToBase64Pdf(buffer), meta })
}

export const pdfCoverPreviewDeleteHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) return auth.response

  const body = await readJson<{ file_id?: string }>(request)
  if (!body.file_id) return fail('INVALID_PARAMS', 'file_id is required', 400)

  const row = await context.env.DB.prepare('select r2_key from pdf_previews where id = ?1 limit 1')
    .bind(body.file_id)
    .first<{ r2_key: string | null }>()

  if (row?.r2_key) {
    await context.env.FILES.delete(row.r2_key)
  }
  // Best-effort: article previews may also have uploaded a source photo
  // under this deterministic key (see pdfArticlePreviewHandler) - deleting
  // a key that was never created is a harmless no-op.
  await context.env.FILES.delete(`previews/${body.file_id}/photo.jpg`).catch(() => null)
  await context.env.DB.prepare('delete from pdf_previews where id = ?1').bind(body.file_id).run()

  return ok({ deleted: true })
}

export const pdfPreviewJobHandler: RouteHandler = async (request, context) => {
  const params = new URL(request.url).searchParams
  const token = params.get('token')
  if (!context.env.PDF_MERGE_TOKEN || token !== context.env.PDF_MERGE_TOKEN) {
    return fail('FORBIDDEN', 'Invalid token', 403)
  }

  const previewId = params.get('preview_id')
  if (!previewId) return fail('INVALID_PARAMS', 'preview_id is required', 400)

  const row = await context.env.DB.prepare('select options_json from pdf_previews where id = ?1 limit 1')
    .bind(previewId)
    .first<{ options_json: string }>()
  if (!row) return fail('NOT_FOUND', 'Preview not found', 404)

  const configRows = await context.env.DB.prepare('select key, value from config').all<{ key: string; value: string | null }>()
  const config = Object.fromEntries((configRows.results || []).map((r) => [r.key, r.value]))

  let options: Record<string, unknown> = {}
  try {
    options = JSON.parse(row.options_json || '{}')
  } catch {
    options = {}
  }

  return ok({ options, config })
}

export const pdfPreviewCompleteHandler: RouteHandler = async (request, context) => {
  const params = new URL(request.url).searchParams
  const token = params.get('token')
  if (!context.env.PDF_MERGE_TOKEN || token !== context.env.PDF_MERGE_TOKEN) {
    return fail('FORBIDDEN', 'Invalid token', 403)
  }

  const body = await readJson<{ preview_id?: string; base64?: string; mime_type?: string; meta?: Record<string, unknown> }>(request)
  if (!body.preview_id || !body.base64) {
    return fail('INVALID_PARAMS', 'preview_id and base64 are required', 400)
  }

  // Article previews report text/html (a single rendered page, no PDF/Chromium
  // step involved - see render_article_preview.py); cover previews omit
  // mime_type and keep defaulting to a real PDF.
  const mimeType = body.mime_type || 'application/pdf'
  const r2Key = `previews/${body.preview_id}.bin`
  await context.env.FILES.put(r2Key, base64ToUint8ArrayPdf(body.base64), {
    httpMetadata: { contentType: mimeType },
  })

  // meta is optional and only used by article previews so far (carries
  // target_page, letting the frontend jump straight to the article's real
  // page) - a cover preview simply omits it.
  await context.env.DB.prepare(
    `update pdf_previews set status = 'DONE', r2_key = ?2, result_meta = ?3, updated_at = ?4 where id = ?1`
  )
    .bind(body.preview_id, r2Key, body.meta ? JSON.stringify(body.meta) : null, new Date().toISOString())
    .run()

  return ok({ ok: true })
}

export const pdfPreviewFailedHandler: RouteHandler = async (request, context) => {
  const params = new URL(request.url).searchParams
  const token = params.get('token')
  if (!context.env.PDF_MERGE_TOKEN || token !== context.env.PDF_MERGE_TOKEN) {
    return fail('FORBIDDEN', 'Invalid token', 403)
  }

  const previewId = params.get('preview_id')
  if (!previewId) return fail('INVALID_PARAMS', 'preview_id is required', 400)

  const message = params.get('message') || 'Preview render failed'
  await context.env.DB.prepare(
    `update pdf_previews set status = 'ERROR', error_message = ?2, updated_at = ?3 where id = ?1`
  )
    .bind(previewId, message, new Date().toISOString())
    .run()

  return ok({ ok: true })
}
