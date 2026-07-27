import { requireAuth } from '../lib/auth'
import { readJson } from '../lib/request'
import { fail, ok } from '../lib/response'
import type { RouteHandler } from '../lib/router'

interface PdfCreateBody {
  from?: string
  to?: string
  options?: Record<string, unknown>
}

async function getPdfJob(db: D1Database, jobId: string) {
  return db.prepare('select * from jobs_pdf where job_id = ?1 limit 1').bind(jobId).first<Record<string, unknown>>()
}

function currentIso() {
  return new Date().toISOString()
}

export const pdfCreateHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) return auth.response

  const body = await readJson<PdfCreateBody>(request)
  if (!body.from || !body.to) {
    return fail('INVALID_PARAMS', 'from and to are required', 400)
  }

  const jobId = crypto.randomUUID()
  await context.env.DB.prepare(
    `insert into jobs_pdf (
       job_id, status, progress, progress_message, created_at, created_by, created_by_pseudo,
       date_from, date_to, error_message
     ) values (?1, 'PENDING', 0, 'Pending...', ?2, ?3, ?4, ?5, ?6, '')`
  )
    .bind(jobId, currentIso(), auth.user.email, auth.user.name, body.from, body.to)
    .run()

  return ok({
    job_id: jobId,
    status: 'PENDING',
    progress: 0,
    progress_message: 'Pending...',
    options: body.options || {},
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

  await context.env.DB.prepare(
    `update jobs_pdf set status = 'RUNNING', progress = 5, progress_message = 'Preparation queued' where job_id = ?1`
  )
    .bind(jobId)
    .run()

  return ok({ queued: true, job_id: jobId, status: 'RUNNING', progress: 5, progress_message: 'Preparation queued' })
}

export const pdfStatusHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) return auth.response

  const jobId = new URL(request.url).searchParams.get('job_id')
  if (!jobId) return fail('INVALID_PARAMS', 'job_id is required', 400)

  const job = await getPdfJob(context.env.DB, jobId)
  if (!job) return fail('NOT_FOUND', 'Job not found', 404)
  return ok(job)
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
    items: items.results || [],
    authors: (authors.results || []).map((row) => row.created_by),
  })
}

export const pdfDeleteHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) return auth.response

  const body = await readJson<{ job_id?: string }>(request)
  if (!body.job_id) return fail('MISSING_JOB_ID', 'Job ID is required', 400)

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

  const body = await readJson<{ job_id?: string }>(request)
  if (!body.job_id) return fail('INVALID_PARAMS', 'Missing job_id', 400)

  const job = await getPdfJob(context.env.DB, body.job_id)
  if (!job) return fail('NOT_FOUND', 'Job not found', 404)

  await context.env.DB.prepare(
    `update jobs_pdf set status = 'RUNNING', progress = 10, progress_message = 'Merge queued' where job_id = ?1`
  )
    .bind(body.job_id)
    .run()

  return ok({ queued: true, code: 'PREPARATION_ONLY' })
}

export const pdfMergeTokenHandler: RouteHandler = async (request, context) => {
  const token = new URL(request.url).searchParams.get('token')
  if (!context.env.PDF_MERGE_TOKEN || token !== context.env.PDF_MERGE_TOKEN) {
    return fail('FORBIDDEN', 'Invalid token', 403)
  }

  return fail('PREPARATION_ONLY', 'Google Drive merge token is not managed by Worker preparation mode yet', 501)
}

export const pdfMergeTokenStatusHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) return auth.response

  const configRow = await context.env.DB.prepare(
    `select value from config where key = 'gdrive_token_expiry' limit 1`
  ).first<{ value: string | null }>()

  return ok({
    configured: !!context.env.GITHUB_TRIGGER_TOKEN,
    expiry: configRow?.value || null,
    source: 'worker-preparation',
  })
}

export const pdfMergeTokenRefreshHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) return auth.response

  return fail('TOKEN_REFRESH_NOT_IMPLEMENTED', 'Token refresh is not implemented in Worker preparation mode yet', 501)
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

  await context.env.DB.prepare(
    `update jobs_pdf set status = 'ERROR', progress = 0, progress_message = 'Merge failed', error_message = ?2 where job_id = ?1`
  )
    .bind(jobId, params.get('message') || 'Merge failed')
    .run()

  return ok({ ok: true })
}

export const pdfMergeCleanupHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) return auth.response

  return ok({ cleaned: false, message: 'No Worker properties to clean in preparation mode.' })
}

export const pdfCoverPreviewHandler: RouteHandler = async (request, context) => {
  const auth = await requireAuth(request, context.env)
  if (!auth.ok) return auth.response
  return fail('PREVIEW_NOT_IMPLEMENTED', 'PDF cover preview is not implemented in Worker preparation mode yet', 501)
}

export const pdfCoverPreviewDeleteHandler: RouteHandler = pdfCoverPreviewHandler
export const pdfCoverPreviewContentHandler: RouteHandler = pdfCoverPreviewHandler
