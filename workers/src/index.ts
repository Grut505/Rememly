import { Router } from './lib/router'
import { fail } from './lib/response'
import { authCheckHandler } from './routes/auth'
import { healthHandler } from './routes/health'
import { getConfigHandler, setConfigHandler } from './routes/config'
import {
  articleCreateHandler,
  articleDeleteHandler,
  articleGetHandler,
  articlePermanentDeleteHandler,
  articlesAuthorsHandler,
  articleUpdateHandler,
  backfillFamileoFingerprintsHandler,
  listArticlesHandler,
} from './routes/articles'
import {
  familiesHandler,
  famileoCreatePostHandler,
  famileoImageHandler,
  famileoPostsHandler,
  famileoPresignedImageHandler,
  famileoStatusHandler,
  famileoTriggerRefreshHandler,
  famileoUpdateSessionHandler,
  famileoUserCredentialsHandler,
  famileoUploadImageHandler,
  importedFingerprintsHandler,
  importedIdsHandler,
} from './routes/famileo'
import { imageFetchHandler, preparationOnlyHandler } from './routes/preparation'
import {
  pdfCoverPreviewContentHandler,
  pdfCoverPreviewDeleteHandler,
  pdfCoverPreviewHandler,
  pdfCancelHandler,
  pdfCreateHandler,
  pdfDeleteHandler,
  pdfListHandler,
  pdfMergeCleanupJobHandler,
  pdfMergeCompleteHandler,
  pdfMergeFailedHandler,
  pdfMergeStatusHandler,
  pdfMergeTokenHandler,
  pdfMergeTokenRefreshHandler,
  pdfMergeTokenStatusHandler,
  pdfMergeTriggerHandler,
  pdfProcessHandler,
  pdfRenderCompleteHandler,
  pdfRenderFailedHandler,
  pdfRenderImageHandler,
  pdfRenderJobHandler,
  pdfRenderStatusHandler,
  pdfStatusHandler,
} from './routes/pdf'
import { logsClearHandler, logsRangeHandler } from './routes/logs'
import { profileGetHandler, profileSaveHandler, usersListHandler } from './routes/users'
import type { Env, AppContext } from './types'

const router = new Router()

function register(method: string, path: string, handler: (request: Request, env: AppContext) => Promise<Response> | Response) {
  router.on(method, path, handler)
}

register('GET', '/', (_request, context) =>
  new Response(`Rememly Workers API (${context.env.APP_ENV})`, { status: 200 })
)
register('GET', '/health', healthHandler)
register('GET', '/auth/check', authCheckHandler)
register('POST', '/auth/check', authCheckHandler)
register('GET', '/config/get', getConfigHandler)
register('POST', '/config/get', getConfigHandler)
register('POST', '/config/set', setConfigHandler)
register('GET', '/users/list', usersListHandler)
register('POST', '/users/list', usersListHandler)
register('GET', '/profile/get', profileGetHandler)
register('POST', '/profile/get', profileGetHandler)
register('POST', '/profile/save', profileSaveHandler)
register('GET', '/articles/list', listArticlesHandler)
register('POST', '/articles/list', listArticlesHandler)
register('GET', '/articles/authors', articlesAuthorsHandler)
register('POST', '/articles/authors', articlesAuthorsHandler)
register('GET', '/articles/get', articleGetHandler)
register('POST', '/articles/get', articleGetHandler)
register('POST', '/articles/create', articleCreateHandler)
register('POST', '/articles/update', articleUpdateHandler)
register('POST', '/articles/delete', articleDeleteHandler)
register('POST', '/articles/permanent-delete', articlePermanentDeleteHandler)
register('POST', '/articles/backfill-famileo-fingerprints', backfillFamileoFingerprintsHandler)
register('GET', '/image/fetch', imageFetchHandler)
register('POST', '/image/fetch', imageFetchHandler)
register('GET', '/famileo/families', familiesHandler)
register('POST', '/famileo/families', familiesHandler)
register('GET', '/famileo/status', famileoStatusHandler)
register('POST', '/famileo/status', famileoStatusHandler)
register('GET', '/famileo/posts', famileoPostsHandler)
register('POST', '/famileo/posts', famileoPostsHandler)
register('GET', '/famileo/image', famileoImageHandler)
register('POST', '/famileo/image', famileoImageHandler)
register('POST', '/famileo/update-session', famileoUpdateSessionHandler)
register('POST', '/famileo/user-credentials', famileoUserCredentialsHandler)
register('GET', '/famileo/trigger-refresh', famileoTriggerRefreshHandler)
register('POST', '/famileo/trigger-refresh', famileoTriggerRefreshHandler)
register('POST', '/famileo/create-post', famileoCreatePostHandler)
register('POST', '/famileo/presigned-image', famileoPresignedImageHandler)
register('POST', '/famileo/upload-image', famileoUploadImageHandler)
register('GET', '/famileo/imported-ids', importedIdsHandler)
register('POST', '/famileo/imported-ids', importedIdsHandler)
register('GET', '/famileo/imported-fingerprints', importedFingerprintsHandler)
register('POST', '/famileo/imported-fingerprints', importedFingerprintsHandler)
register('POST', '/pdf/create', pdfCreateHandler)
register('POST', '/pdf/process', pdfProcessHandler)
register('GET', '/pdf/status', pdfStatusHandler)
register('POST', '/pdf/status', pdfStatusHandler)
register('GET', '/pdf/list', pdfListHandler)
register('POST', '/pdf/list', pdfListHandler)
register('POST', '/pdf/delete', pdfDeleteHandler)
register('POST', '/pdf/cancel', pdfCancelHandler)
register('POST', '/pdf/merge-trigger', pdfMergeTriggerHandler)
register('GET', '/pdf/merge-token', pdfMergeTokenHandler)
register('POST', '/pdf/merge-token', pdfMergeTokenHandler)
register('GET', '/pdf/merge-token-status', pdfMergeTokenStatusHandler)
register('POST', '/pdf/merge-token-status', pdfMergeTokenStatusHandler)
register('POST', '/pdf/merge-token-refresh', pdfMergeTokenRefreshHandler)
register('GET', '/pdf/merge-status', pdfMergeStatusHandler)
register('POST', '/pdf/merge-status', pdfMergeStatusHandler)
register('GET', '/pdf/merge-complete', pdfMergeCompleteHandler)
register('POST', '/pdf/merge-complete', pdfMergeCompleteHandler)
register('GET', '/pdf/merge-failed', pdfMergeFailedHandler)
register('POST', '/pdf/merge-failed', pdfMergeFailedHandler)
register('GET', '/pdf/render-job', pdfRenderJobHandler)
register('POST', '/pdf/render-job', pdfRenderJobHandler)
register('GET', '/pdf/render-image', pdfRenderImageHandler)
register('GET', '/pdf/render-status', pdfRenderStatusHandler)
register('POST', '/pdf/render-status', pdfRenderStatusHandler)
register('GET', '/pdf/render-complete', pdfRenderCompleteHandler)
register('POST', '/pdf/render-complete', pdfRenderCompleteHandler)
register('GET', '/pdf/render-failed', pdfRenderFailedHandler)
register('POST', '/pdf/render-failed', pdfRenderFailedHandler)
register('POST', '/pdf/merge-cancel', preparationOnlyHandler)
register('POST', '/pdf/merge-cleanup', pdfMergeCleanupJobHandler)
register('POST', '/pdf/cover-preview', pdfCoverPreviewHandler)
register('GET', '/pdf/cover-preview', pdfCoverPreviewHandler)
register('POST', '/pdf/cover-preview-delete', pdfCoverPreviewDeleteHandler)
register('GET', '/pdf/cover-preview-content', pdfCoverPreviewContentHandler)
register('POST', '/pdf/cover-preview-content', pdfCoverPreviewContentHandler)
register('GET', '/logs/pdf/range', logsRangeHandler)
register('POST', '/logs/pdf/range', logsRangeHandler)
register('POST', '/logs/pdf/clear', logsClearHandler)
register('GET', '/logs/famileo/range', logsRangeHandler)
register('POST', '/logs/famileo/range', logsRangeHandler)
register('POST', '/logs/famileo/clear', logsClearHandler)

function normalizeWorkerRequest(request: Request) {
  const url = new URL(request.url)
  const legacyPath = url.searchParams.get('path')
  if (!legacyPath || url.pathname !== '/') {
    return request
  }

  const nextUrl = new URL(request.url)
  nextUrl.pathname = `/${legacyPath.replace(/^\/+/, '')}`
  nextUrl.searchParams.delete('path')

  return new Request(nextUrl.toString(), request)
}

function withCors(response: Response): Response {
  response.headers.set('Access-Control-Allow-Origin', '*')
  return response
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const context: AppContext = {
      requestId: crypto.randomUUID(),
      env,
    }

    try {
      return withCors(await router.handle(normalizeWorkerRequest(request), context))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown worker error'
      return withCors(fail('INTERNAL_ERROR', message, 500))
    }
  },
}
