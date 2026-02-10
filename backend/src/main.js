// Main entry point for Google Apps Script Web App

function doGet(e) {
  try {
    const params = e.parameter || {};
    const path = params.path || '';

    // Allow GitHub Actions callbacks via GET (Apps Script redirects break POST)
    if (path === 'pdf/merge-status') {
      const body = {
        token: params.token,
        job_id: params.job_id,
        progress: params.progress ? Number(params.progress) : undefined,
        message: params.message,
        run_id: params.run_id,
      };
      return handlePdfMergeStatus(body);
    }
    if (path === 'pdf/merge-complete') {
      const body = {
        token: params.token,
        job_id: params.job_id,
        file_id: params.file_id,
        url: params.url,
        clean_chunks: params.clean_chunks === 'true',
      };
      return handlePdfMergeComplete(body);
    }
    if (path === 'pdf/merge-failed') {
      const body = {
        token: params.token,
        job_id: params.job_id,
        message: params.message,
      };
      return handlePdfMergeFailed(body);
    }
    if (path === 'pdf/merge-cancel') {
      const body = {
        job_id: params.job_id,
      };
      return handlePdfMergeCancel(body);
    }
    if (path === 'pdf/cover-preview-content') {
      const token = getAuthToken(e);
      const authResult = checkAuth(token);
      if (!authResult.ok) {
        return createResponse({ ok: false, error: authResult.error });
      }
      const body = {
        file_id: params.file_id,
      };
      return handlePdfCoverPreviewContent(body);
    }
    return ContentService.createTextOutput(
      JSON.stringify({ error: 'Use POST requests' })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (e) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: String(e) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const params = e.parameter;
    const path = params.path || '';

    // Special endpoint for GitHub Actions (no user auth, uses secret token)
    if (path === 'famileo/update-session') {
      const body = e.postData ? JSON.parse(e.postData.contents) : {};
      return handleFamileoUpdateSession(body);
    }
    if (path === 'famileo/user-credentials') {
      const body = e.postData ? JSON.parse(e.postData.contents) : {};
      return handleFamileoUserCredentials(body);
    }
    if (path === 'pdf/merge-complete') {
      const body = e.postData ? JSON.parse(e.postData.contents) : {};
      return handlePdfMergeComplete(body);
    }
    if (path === 'pdf/merge-status') {
      const body = e.postData ? JSON.parse(e.postData.contents) : {};
      return handlePdfMergeStatus(body);
    }
    if (path === 'pdf/merge-failed') {
      const body = e.postData ? JSON.parse(e.postData.contents) : {};
      return handlePdfMergeFailed(body);
    }
    if (path === 'pdf/merge-cleanup') {
      const body = e.postData ? JSON.parse(e.postData.contents) : {};
      return handlePdfMergeCleanup(body);
    }
    if (path === 'pdf/merge-cancel') {
      const body = e.postData ? JSON.parse(e.postData.contents) : {};
      return handlePdfMergeCancel(body);
    }
    if (path === 'pdf/job-by-folder') {
      const body = e.postData ? JSON.parse(e.postData.contents) : {};
      return handlePdfJobByFolder(body);
    }

    // Get auth token from header or parameter
    const token = getAuthToken(e);

    // Check authentication
    const authResult = checkAuth(token, { allowPendingCreate: path === 'auth/check' });
    if (!authResult.ok) {
      return createResponse({ ok: false, error: authResult.error });
    }

    // Route to appropriate handler
    const body = e.postData ? JSON.parse(e.postData.contents) : {};

    switch (path) {
      case 'auth/check':
        return handleAuthCheck(authResult.user);

      case 'articles/list':
        return handleArticlesList(params);

      case 'articles/authors':
        return handleArticlesAuthors(params);

      case 'articles/get':
        return handleArticleGet(params.id);

      case 'articles/create':
        return handleArticleCreate(body);

      case 'articles/update':
        return handleArticleUpdate(body);

      case 'articles/delete':
        return handleArticleDelete(params.id);

      case 'articles/permanent-delete':
        return handleArticlePermanentDelete(params.id);

      case 'articles/backfill-famileo-fingerprints':
        return createResponse({ ok: true, data: backfillFamileoFingerprints() });

      case 'pdf/create':
        return handlePdfCreate(body, authResult.user);

      case 'pdf/cover-preview':
        return handlePdfCoverPreview(body, authResult.user);

      case 'pdf/cover-preview-delete':
        return handlePdfCoverPreviewDelete(body);

      case 'pdf/cover-preview-content':
        return handlePdfCoverPreviewContent(body);

      case 'pdf/process':
        return handlePdfProcess(params);

      case 'pdf/status':
        return handlePdfStatus(params.job_id);

      case 'pdf/list':
        return handlePdfList(params);

      case 'pdf/delete':
        return handlePdfDelete(body);

      case 'pdf/cancel':
        return handlePdfCancel(body);

      case 'pdf/merge-trigger':
        return handlePdfMergeTrigger(body);

      case 'pdf/cleanup-properties':
        return createResponse({ ok: true, data: cleanupOrphanPdfProperties() });

      case 'profile/get':
        return handleProfileGet(authResult.user.email);

      case 'profile/save':
        return handleProfileSave(authResult.user.email, body);

      case 'users/list':
        return handleUsersList();

      case 'image/fetch':
        return handleImageFetch(params.fileId);

      case 'famileo/status':
        return handleFamileoStatus(params, authResult.user.email);

      case 'famileo/posts':
        return handleFamileoPosts(params, authResult.user.email);

      case 'famileo/image':
        return handleFamileoImage(params, authResult.user.email);

      case 'famileo/trigger-refresh':
        return handleFamileoTriggerRefresh(authResult.user.email);

      case 'famileo/families':
        return handleFamileoFamilies();

      case 'famileo/imported-ids':
        return handleFamileoImportedIds();

      case 'famileo/imported-fingerprints':
        return handleFamileoImportedFingerprints();

      case 'famileo/create-post':
        return handleFamileoCreatePost(body, authResult.user.email);

      case 'famileo/presigned-image':
        return handleFamileoPresignedImage(body, authResult.user.email);

      case 'famileo/upload-image':
        return handleFamileoUploadImage(body, authResult.user.email);

      case 'config/get':
        return handleConfigGet(params.key);

      case 'config/set':
        return handleConfigSet(body);

      case 'logs/pdf/range':
        return createResponse({ ok: true, data: getPdfLogsRange() });

      case 'logs/pdf/clear':
        return createResponse({ ok: true, data: clearPdfLogsRange(body?.from, body?.to) });

      default:
        return createResponse({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Endpoint not found' },
        });
    }
  } catch (error) {
    Logger.log('Error: ' + error);
    return createResponse({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: String(error) },
    });
  }
}

function getAuthToken(e) {
  // Try to get auth parameter (new email-based auth: "Email user@example.com")
  if (e.parameter && e.parameter.auth) {
    return e.parameter.auth;
  }
  // Fallback to legacy token parameter
  if (e.parameter && e.parameter.token) {
    return e.parameter.token;
  }
  return '';
}

function createResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);

  // Add CORS headers
  return output;
}

function handleConfigGet(key) {
  if (!key) {
    return createResponse({
      ok: false,
      error: { code: 'MISSING_KEY', message: 'Config key is required' }
    });
  }
  const value = getConfigValue(key);
  return createResponse({ ok: true, data: { key, value } });
}

function handleConfigSet(body) {
  const { key, value } = body || {};
  if (!key) {
    return createResponse({
      ok: false,
      error: { code: 'MISSING_KEY', message: 'Config key is required' }
    });
  }
  setConfigValue(key, value || '');
  return createResponse({ ok: true, data: { key, value: value || '' } });
}
