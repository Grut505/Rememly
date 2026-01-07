// Main entry point for Google Apps Script Web App

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  try {
    const params = e.parameter;
    const path = params.path || '';

    // Get auth token from header or parameter
    const token = getAuthToken(e);

    // Check authentication
    const authResult = checkAuth(token);
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

      case 'articles/get':
        return handleArticleGet(params.id);

      case 'articles/create':
        return handleArticleCreate(body);

      case 'articles/update':
        return handleArticleUpdate(body);

      case 'articles/delete':
        return handleArticleDelete(params.id);

      case 'pdf/create':
        return handlePdfCreate(body, authResult.user);

      case 'pdf/status':
        return handlePdfStatus(params.job_id);

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
  // Try to get from Authorization header first
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
