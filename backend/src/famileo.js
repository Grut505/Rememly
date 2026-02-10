// Famileo API integration
// Credentials are stored in Script Properties (never in code)

/**
 * Update Famileo session cookies in Script Properties
 * Run this manually from the Apps Script editor when cookies expire
 * Get fresh cookies from browser DevTools after manual login on famileo.com
 *
 * Usage: updateFamileoSession('your-phpsessid', 'your-rememberme-cookie')
 */
function updateFamileoSession(phpsessid, rememberme, familyId) {
  if (!phpsessid || !rememberme) {
    throw new Error('Usage: updateFamileoSession("phpsessid", "rememberme", "familyId")');
  }

  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    'FAMILEO_FAMILY_ID': familyId || props.getProperty('FAMILEO_FAMILY_ID') || '321238',
    'FAMILEO_SESSION': JSON.stringify({
      'PHPSESSID': phpsessid,
      'REMEMBERME': rememberme
    })
  });
  Logger.log('Famileo session updated successfully');
}

/**
 * Clear Famileo session from Script Properties
 */
function clearFamileoSession() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('FAMILEO_FAMILY_ID');
  props.deleteProperty('FAMILEO_SESSION');
  Logger.log('Famileo session cleared');
}

function getFamileoSessionKey(userEmail) {
  const normalized = normalizeEmail(userEmail || '');
  if (!normalized) return 'famileo_session';
  return `famileo_session_${normalized}`;
}

/**
 * Get stored session cookies
 * First tries to read from Config sheet (updated by GitHub Actions)
 * Falls back to Script Properties (legacy/manual method)
 */
function getFamileoSession(userEmail) {
  // Try Config sheet first (populated by GitHub Actions)
  const configKey = getFamileoSessionKey(userEmail);
  const configSession = getConfigValue(configKey) || getConfigValue('famileo_session');
  if (configSession) {
    try {
      return JSON.parse(configSession);
    } catch (e) {
      Logger.log('Invalid session format in Config sheet');
    }
  }

  // Fallback to Script Properties
  const props = PropertiesService.getScriptProperties();
  const sessionJson = props.getProperty('FAMILEO_SESSION');

  if (!sessionJson) {
    throw new Error('Famileo session not configured. Waiting for GitHub Actions to refresh cookies.');
  }

  try {
    return JSON.parse(sessionJson);
  } catch (e) {
    throw new Error('Invalid Famileo session format');
  }
}

/**
 * Handler for famileo/update-session endpoint
 * Called by GitHub Actions to update session cookies
 * Secured by a secret token stored in Script Properties
 */
function handleFamileoUpdateSession(body) {
  try {
    // Verify secret token
    const props = PropertiesService.getScriptProperties();
    const expectedToken = props.getProperty('FAMILEO_UPDATE_TOKEN');
    const targetEmail = normalizeEmail(body.user_email || body.userEmail || '');

    if (!expectedToken) {
      logFamileoEvent('error', 'Famileo session update failed: missing update token', targetEmail, {});
      return createResponse({
        ok: false,
        error: { code: 'NOT_CONFIGURED', message: 'Update token not configured in Script Properties' }
      });
    }

    if (body.token !== expectedToken) {
      logFamileoEvent('error', 'Famileo session update failed: invalid token', targetEmail, {});
      return createResponse({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid token' }
      });
    }

    // Validate session data
    if (!body.phpsessid || !body.rememberme) {
      logFamileoEvent('error', 'Famileo session update failed: missing cookies', targetEmail, {});
      return createResponse({
        ok: false,
        error: { code: 'INVALID_DATA', message: 'Missing phpsessid or rememberme' }
      });
    }

    const session = {
      PHPSESSID: body.phpsessid,
      REMEMBERME: body.rememberme
    };
    const sessionKey = getFamileoSessionKey(targetEmail);
    setConfigValue(sessionKey, JSON.stringify(session));

    // Optionally update family ID
    if (body.familyId) {
      setConfigValue('famileo_family_id', body.familyId);
    }

    Logger.log('Famileo session updated via API');
    logFamileoEvent('info', 'Famileo session updated via API', targetEmail, { session_key: sessionKey });

    return createResponse({
      ok: true,
      data: { message: 'Session updated successfully', session_key: sessionKey }
    });
  } catch (error) {
    Logger.log('Update session error: ' + error);
    return createResponse({
      ok: false,
      error: { code: 'UPDATE_ERROR', message: String(error) }
    });
  }
}

/**
 * Format cookies object as Cookie header string
 */
function formatCookies(cookies) {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

/**
 * Fetch posts from Famileo API
 * @param {number} limit - Number of posts to fetch
 * @param {string} timestamp - ISO timestamp for pagination (fetches posts before this date)
 * @param {string} familyId - Optional family ID to use (overrides default)
 */
function famileoFetchPosts(limit = 20, timestamp = null, familyId = null, userEmail = null) {
  if (!familyId) {
    const props = PropertiesService.getScriptProperties();
    familyId = props.getProperty('FAMILEO_FAMILY_ID') || '321238';
  }

  const session = getFamileoSession();

  let url = `https://www.famileo.com/api/families/${familyId}/posts?limit=${limit}`;
  if (timestamp) {
    url += `&timestamp=${encodeURIComponent(timestamp)}`;
  }

  const response = UrlFetchApp.fetch(url, {
    method: 'GET',
    muteHttpExceptions: true,
    headers: {
      'Cookie': formatCookies(session),
      'Accept': 'application/json',
      'Referer': 'https://www.famileo.com/'
    }
  });

  const responseCode = response.getResponseCode();
  Logger.log('Fetch posts response code: ' + responseCode);

  if (responseCode === 401 || responseCode === 403) {
    throw new Error('Session expired. Please update cookies by running initFamileoSession() with fresh cookies from browser.');
  }

  if (responseCode !== 200) {
    throw new Error('Failed to fetch posts: HTTP ' + responseCode);
  }

  return JSON.parse(response.getContentText());
}

/**
 * Handler for famileo/posts endpoint
 * Params:
 *   - limit: number of posts (default 20)
 *   - timestamp: ISO date string to fetch posts before (for pagination)
 *   - family_id: optional Famileo family ID to use
 */
function handleFamileoPosts(params, userEmail) {
  try {
    logFamileoEvent('info', 'Famileo posts: start', userEmail, { params: params || {} });
    const limit = parseInt(params.limit) || 20;
    const timestamp = params.timestamp || null;
    const familyId = params.family_id || null;
    const authorFilterRaw = params.author_filter || params.authorFilter || 'declared';
    const authorFilter = String(authorFilterRaw).toLowerCase();
    const isSpecificAuthor = authorFilter && authorFilter !== 'all' && authorFilter !== 'others' && authorFilter !== 'declared';

    const response = famileoFetchPosts(limit, timestamp, familyId, userEmail);

    // Build allowed authors from users sheet (famileo_name)
    const famileoAuthorMap = buildFamileoAuthorMap();

    const rawPosts = response.familyWall || [];
    const counts = { declared: 0, others: 0, total: rawPosts.length };

    const posts = rawPosts
      .filter(post => {
        const authorKey = normalizeFamileoName(post.author_name);
        const author = famileoAuthorMap[authorKey];
        const isDeclared = !!author;
        if (isDeclared) {
          counts.declared += 1;
        } else {
          counts.others += 1;
        }
        if (authorFilter === 'all') return true;
        if (authorFilter === 'others') return !isDeclared;
        if (authorFilter === 'declared') return isDeclared;
        if (isSpecificAuthor) {
          const authorEmail = author ? String(author.email || '').toLowerCase() : '';
          const authorPseudo = author ? String(author.pseudo || '').toLowerCase() : '';
          return authorFilter === authorEmail || authorFilter === authorPseudo || authorFilter === authorKey;
        }
        return isDeclared;
      })
      .map(post => {
        const author = famileoAuthorMap[normalizeFamileoName(post.author_name)];
        const authorEmail = author ? author.email : '';
        const authorPseudo = author && author.pseudo ? author.pseudo : post.author_name.split(' ')[0];

        return {
          id: post.wall_post_id,
          text: post.text,
          date: post.date,
          date_tz: post.date_tz,
          author_id: post.author_id,
          author_name: post.author_name,
          author_email: authorEmail,
          author_pseudo: authorPseudo,
          image_url: post.image_2x || post.image,
          full_image_url: post.full_image || post.image_2x || post.image,
          image_orientation: post.image_orientation
        };
      });

    // Calculate next_timestamp for pagination (use last post from raw response, not filtered)
    let nextTimestamp = null;
    // rawPosts declared above
    if (rawPosts.length > 0) {
      const lastRawPost = rawPosts[rawPosts.length - 1];
      // Use date_tz if available, otherwise convert date to ISO
      nextTimestamp = lastRawPost.date_tz || new Date(lastRawPost.date).toISOString();
    }

    const responsePayload = {
      ok: true,
      data: {
        posts: posts,
        unread: response.unreadPost || 0,
        next_timestamp: nextTimestamp,
        has_more: rawPosts.length === limit,
        counts: counts
      }
    };
    logFamileoEvent('info', 'Famileo posts: success', userEmail, { counts: counts });
    return createResponse(responsePayload);
  } catch (error) {
    Logger.log('Famileo posts error: ' + error);
    logFamileoEvent('error', 'Famileo posts: failed', userEmail, { error: String(error) });
    return createResponse({
      ok: false,
      error: { code: 'FAMILEO_ERROR', message: String(error) }
    });
  }
}

/**
 * Fetch a Famileo image and return as base64
 */
function famileoFetchImage(imageUrl, userEmail) {
  // Accept Famileo image URLs from cloudfront or direct famileo.com domains
  if (!imageUrl || (!imageUrl.includes('cloudfront.net') && !imageUrl.includes('famileo.com') && !imageUrl.includes('famileo.'))) {
    throw new Error('Invalid Famileo image URL: ' + (imageUrl || 'empty'));
  }

  const session = getFamileoSession(userEmail);

  const response = UrlFetchApp.fetch(imageUrl, {
    method: 'GET',
    muteHttpExceptions: true,
    headers: {
      'Cookie': formatCookies(session),
      'Referer': 'https://www.famileo.com/'
    }
  });

  const responseCode = response.getResponseCode();
  if (responseCode !== 200) {
    throw new Error('Failed to fetch image: HTTP ' + responseCode);
  }

  const blob = response.getBlob();
  const base64 = Utilities.base64Encode(blob.getBytes());
  const mimeType = blob.getContentType() || 'image/jpeg';

  return {
    base64: base64,
    mimeType: mimeType
  };
}

/**
 * Handler for famileo/user-credentials endpoint (GitHub Actions)
 * Returns encrypted Famileo password for a given user email
 */
function handleFamileoUserCredentials(body) {
  try {
    const props = PropertiesService.getScriptProperties();
    const expectedToken = props.getProperty('FAMILEO_UPDATE_TOKEN');
    const targetEmail = normalizeEmail(body.user_email || body.userEmail || '');

    if (!expectedToken) {
      logFamileoEvent('error', 'Famileo credentials failed: missing update token', targetEmail, {});
      return createResponse({
        ok: false,
        error: { code: 'NOT_CONFIGURED', message: 'Update token not configured in Script Properties' }
      });
    }

    if (body.token !== expectedToken) {
      logFamileoEvent('error', 'Famileo credentials failed: invalid token', targetEmail, {});
      return createResponse({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid token' }
      });
    }

    if (!targetEmail) {
      logFamileoEvent('error', 'Famileo credentials failed: missing user_email', targetEmail, {});
      return createResponse({
        ok: false,
        error: { code: 'INVALID_DATA', message: 'Missing user_email' }
      });
    }

    const user = findUserByEmail(targetEmail);
    if (!user || !user.famileo_password_enc) {
      logFamileoEvent('error', 'Famileo credentials failed: no password configured', targetEmail, {});
      return createResponse({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'No password configured for this user' }
      });
    }

    logFamileoEvent('info', 'Famileo credentials: success', targetEmail, {
      user_email: targetEmail,
      famileo_email: user.famileo_email || '',
    });

    return createResponse({
      ok: true,
      data: {
        user_email: targetEmail,
        famileo_email: user.famileo_email || targetEmail,
        password_enc: user.famileo_password_enc,
      }
    });
  } catch (error) {
    Logger.log('Famileo user credentials error: ' + error);
    logFamileoEvent('error', 'Famileo credentials failed: exception', body && (body.user_email || body.userEmail), { error: String(error) });
    return createResponse({
      ok: false,
      error: { code: 'FAMILEO_ERROR', message: String(error) }
    });
  }
}

/**
 * Create a Famileo post
 */
function famileoCreatePost(text, publishedAt, familyId, imageKey, isFullPage, userEmail) {
  const session = getFamileoSession(userEmail);
  const targetFamilyId = familyId || '321238';
  const url = `https://www.famileo.com/api/families/${targetFamilyId}/posts?return_validation_errors=1`;

  const payload = {
    text: text || '',
    is_private: '0',
    is_full_page: isFullPage ? '1' : '0',
    published_at: publishedAt || new Date().toISOString(),
    duplicate_options: '[]',
  };
  if (imageKey) {
    payload.image = imageKey;
  }

  logFamileoEvent('info', 'Famileo create post payload', userEmail, {
    family_id: targetFamilyId,
    text_preview: String(payload.text).substring(0, 120),
    published_at: payload.published_at,
    image: imageKey || '',
    is_full_page: isFullPage ? '1' : '0',
  });

  const response = UrlFetchApp.fetch(url, {
    method: 'POST',
    muteHttpExceptions: true,
    headers: {
      'Cookie': formatCookies(session),
      'Referer': 'https://www.famileo.com/'
    },
    payload: payload,
  });

  const status = response.getResponseCode();
  const body = response.getContentText();

  logFamileoEvent('info', 'Famileo create post response', userEmail, {
    status: status,
    body: body,
  });

  return { status: status, body: body };
}

/**
 * Request a presigned upload URL for Famileo post image
 */
function famileoGetPresignedImageUrl(userEmail) {
  const session = getFamileoSession(userEmail);
  const url = 'https://www.famileo.com/api/v1/presigned_urls';
  const payload = JSON.stringify({ type: 'post.image' });

  logFamileoEvent('info', 'Famileo presign request', userEmail, { type: 'post.image' });

  const response = UrlFetchApp.fetch(url, {
    method: 'POST',
    muteHttpExceptions: true,
    headers: {
      'Cookie': formatCookies(session),
      'Referer': 'https://www.famileo.com/',
      'Content-Type': 'application/json',
    },
    payload: payload,
  });

  const status = response.getResponseCode();
  const body = response.getContentText();

  logFamileoEvent('info', 'Famileo presign response', userEmail, { status: status, body: body });

  return { status: status, body: body };
}

/**
 * Upload an image to the presigned S3 form
 */
function famileoUploadImage(presign, base64, mimeType, filename, userEmail) {
  if (!presign || !presign.form || !presign.form.inputs || !presign.form.attributes || !presign.form.attributes.action) {
    throw new Error('Invalid presign payload');
  }
  if (!base64) {
    throw new Error('Missing base64 image');
  }

  const actionUrl = presign.form.attributes.action;
  const inputs = presign.form.inputs;
  const contentType = mimeType || 'image/jpeg';
  const fileName = filename || inputs['X-Amz-Meta-Filename'] || 'Untitled.jpg';

  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, contentType, fileName);

  const payload = {
    key: inputs.key,
    'Content-Type': contentType,
    'X-Amz-Meta-Filename': fileName,
    'X-Amz-Credential': inputs['X-Amz-Credential'],
    'X-Amz-Algorithm': inputs['X-Amz-Algorithm'],
    'X-Amz-Date': inputs['X-Amz-Date'],
    Policy: inputs.Policy,
    'X-Amz-Signature': inputs['X-Amz-Signature'],
    file: blob,
  };

  logFamileoEvent('info', 'Famileo upload image request', userEmail, {
    action: actionUrl,
    key: inputs.key,
    filename: fileName,
    content_type: contentType,
  });

  const response = UrlFetchApp.fetch(actionUrl, {
    method: 'POST',
    muteHttpExceptions: true,
    payload: payload,
  });

  const status = response.getResponseCode();
  const body = response.getContentText();

  logFamileoEvent('info', 'Famileo upload image response', userEmail, { status: status, body: body });

  return { status: status, body: body, key: inputs.key };
}

/**
 * Handler for famileo/image endpoint
 */
function handleFamileoImage(params, userEmail) {
  try {
    const imageUrl = params.url;
    if (!imageUrl) {
      return createResponse({
        ok: false,
        error: { code: 'MISSING_URL', message: 'Image URL required' }
      });
    }

    const image = famileoFetchImage(decodeURIComponent(imageUrl), userEmail);

    return createResponse({
      ok: true,
      data: {
        base64: image.base64,
        mimeType: image.mimeType
      }
    });
  } catch (error) {
    Logger.log('Famileo image error: ' + error);
    return createResponse({
      ok: false,
      error: { code: 'FAMILEO_ERROR', message: String(error) }
    });
  }
}

/**
 * Handler for famileo/status endpoint - check if session is valid
 */
function handleFamileoStatus(params, userEmail) {
  try {
    const sessionJson = getConfigValue(getFamileoSessionKey(userEmail)) || getConfigValue('famileo_session');

    if (!sessionJson) {
      return createResponse({
        ok: true,
        data: { configured: false, valid: false, message: 'No session configured' }
      });
    }

    const shouldValidate = params && (params.validate === 'true' || params.validate === true);
    if (!shouldValidate) {
      return createResponse({
        ok: true,
        data: { configured: true, valid: true, message: 'Session configured' }
      });
    }

    try {
      const familyId = params && params.family_id ? params.family_id : null;
      famileoFetchPosts(1, null, familyId, userEmail);
      return createResponse({
        ok: true,
        data: { configured: true, valid: true, message: 'Session valid' }
      });
    } catch (error) {
      return createResponse({
        ok: true,
        data: { configured: true, valid: false, message: String(error) }
      });
    }
  } catch (error) {
    return createResponse({
      ok: false,
      error: { code: 'FAMILEO_ERROR', message: String(error) }
    });
  }
}

/**
 * Handler for famileo/trigger-refresh endpoint
 * Triggers the GitHub Actions workflow to refresh Famileo session
 */
function handleFamileoTriggerRefresh(userEmail) {
  try {
    const props = PropertiesService.getScriptProperties();
    const githubToken = props.getProperty('GITHUB_TOKEN');
    const targetEmail = normalizeEmail(userEmail || '');

    if (!targetEmail) {
      logFamileoEvent('error', 'Famileo refresh failed: missing user_email', userEmail, {});
      return createResponse({
        ok: false,
        error: { code: 'INVALID_DATA', message: 'user_email is required' }
      });
    }

    const user = findUserByEmail(targetEmail);
    if (!user || !user.famileo_password_enc) {
      logFamileoEvent('error', 'Famileo refresh failed: missing password', userEmail, { user_email: targetEmail });
      return createResponse({
        ok: false,
        error: { code: 'INVALID_DATA', message: 'Famileo password is missing for this user' }
      });
    }

    if (!user.famileo_email) {
      logFamileoEvent('error', 'Famileo refresh failed: missing famileo_email', userEmail, { user_email: targetEmail });
      return createResponse({
        ok: false,
        error: { code: 'INVALID_DATA', message: 'Famileo email is missing for this user' }
      });
    }

    if (!githubToken) {
      logFamileoEvent('error', 'Famileo refresh failed: missing GitHub token', userEmail, {});
      return createResponse({
        ok: false,
        error: { code: 'NOT_CONFIGURED', message: 'GitHub token not configured in Script Properties' }
      });
    }

    // Trigger the workflow via GitHub API
    logFamileoEvent('info', 'Famileo refresh trigger: start', userEmail, { user_email: targetEmail });
    const response = UrlFetchApp.fetch(
      'https://api.github.com/repos/Grut505/Rememly/actions/workflows/famileo-refresh.yml/dispatches',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + githubToken,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        payload: JSON.stringify({
          ref: 'main',
          inputs: {
            user_email: targetEmail
          }
        }),
        muteHttpExceptions: true
      }
    );

    const responseCode = response.getResponseCode();
    Logger.log('GitHub API response code: ' + responseCode);

    if (responseCode === 204) {
      logFamileoEvent('info', 'Famileo refresh trigger: queued', userEmail, { user_email: targetEmail });
      return createResponse({
        ok: true,
        data: { message: 'Workflow triggered successfully. Session will be refreshed in ~2 minutes.' }
      });
    } else {
      const responseText = response.getContentText();
      Logger.log('GitHub API error: ' + responseText);
      logFamileoEvent('error', 'Famileo refresh trigger failed', userEmail, {
        user_email: targetEmail,
        status: responseCode,
        response: responseText,
      });
      return createResponse({
        ok: false,
        error: {
          code: 'GITHUB_ERROR',
          message: 'Failed to trigger workflow: HTTP ' + responseCode,
          details: responseText
        }
      });
    }
  } catch (error) {
    Logger.log('Trigger refresh error: ' + error);
    return createResponse({
      ok: false,
      error: { code: 'TRIGGER_ERROR', message: String(error) }
    });
  }
}

/**
 * Handler for famileo/families endpoint
 * Returns list of configured families from the families sheet
 */
function handleFamileoFamilies() {
  try {
    const families = getFamilies();

    return createResponse({
      ok: true,
      data: { families: families }
    });
  } catch (error) {
    Logger.log('Famileo families error: ' + error);
    return createResponse({
      ok: false,
      error: { code: 'FAMILEO_ERROR', message: String(error) }
    });
  }
}

/**
 * Handler for famileo/imported-ids endpoint
 * Returns list of Famileo post IDs that have already been imported
 */
function handleFamileoImportedIds() {
  try {
    const ids = getImportedFamileoPostIds();

    return createResponse({
      ok: true,
      data: { ids: ids }
    });
  } catch (error) {
    Logger.log('Famileo imported-ids error: ' + error);
    return createResponse({
      ok: false,
      error: { code: 'FAMILEO_ERROR', message: String(error) }
    });
  }
}

/**
 * Handler for famileo/presigned-image endpoint
 */
function handleFamileoPresignedImage(userEmail) {
  try {
    const result = famileoGetPresignedImageUrl(userEmail);
    const lowerBody = String(result.body || '').toLowerCase();
    const sessionExpired = result.status === 401 ||
      lowerBody.includes('session expired') ||
      lowerBody.includes('invalid session') ||
      lowerBody.includes('not configured');

    if (sessionExpired) {
      try {
        handleFamileoTriggerRefresh(userEmail);
      } catch (refreshError) {
        logFamileoEvent('error', 'Famileo presign refresh error', userEmail, { error: String(refreshError) });
      }
      return createResponse({
        ok: false,
        error: { code: 'FAMILEO_SESSION', message: 'Session Famileo expirée. Rafraîchissement déclenché.' }
      });
    }

    if (result.status < 200 || result.status >= 300) {
      return createResponse({
        ok: false,
        error: { code: 'FAMILEO_ERROR', message: 'Famileo presign failed (HTTP ' + result.status + ')' }
      });
    }

    return createResponse({
      ok: true,
      data: { raw: result.body }
    });
  } catch (error) {
    logFamileoEvent('error', 'Famileo presign error', userEmail, { error: String(error) });
    return createResponse({
      ok: false,
      error: { code: 'FAMILEO_ERROR', message: String(error) }
    });
  }
}

/**
 * Handler for famileo/upload-image endpoint
 */
function handleFamileoUploadImage(body, userEmail) {
  try {
    const presignRaw = body && body.presign ? body.presign : null;
    const presign = typeof presignRaw === 'string' ? JSON.parse(presignRaw) : presignRaw;
    const imageBase64 = body && body.image_base64 ? String(body.image_base64) : '';
    const mimeType = body && body.mime_type ? String(body.mime_type) : '';
    const filename = body && body.filename ? String(body.filename) : '';

    const result = famileoUploadImage(presign, imageBase64, mimeType, filename, userEmail);
    if (result.status < 200 || result.status >= 300) {
      return createResponse({
        ok: false,
        error: { code: 'FAMILEO_ERROR', message: 'Famileo upload failed (HTTP ' + result.status + ')' }
      });
    }

    return createResponse({
      ok: true,
      data: result
    });
  } catch (error) {
    logFamileoEvent('error', 'Famileo upload image error', userEmail, { error: String(error) });
    return createResponse({
      ok: false,
      error: { code: 'FAMILEO_ERROR', message: String(error) }
    });
  }
}

/**
 * Handler for famileo/create-post endpoint
 */
function handleFamileoCreatePost(body, userEmail) {
  try {
    const text = body && body.text ? String(body.text) : '';
    const publishedAt = body && body.published_at ? String(body.published_at) : '';
    const familyId = body && body.family_id ? String(body.family_id) : null;
    const imageKey = body && body.image_key ? String(body.image_key) : '';
    const isFullPage = body && (body.is_full_page === true || body.is_full_page === '1' || body.is_full_page === 1);
    const authorEmail = body && body.author_email ? String(body.author_email) : '';

    if (authorEmail) {
      logFamileoEvent('info', 'Famileo create post author override', userEmail, { author_email: authorEmail });
    }

    const result = famileoCreatePost(text, publishedAt, familyId, imageKey, isFullPage, userEmail);
    const lowerBody = String(result.body || '').toLowerCase();
    const sessionExpired = result.status === 401 ||
      lowerBody.includes('session expired') ||
      lowerBody.includes('invalid session') ||
      lowerBody.includes('not configured');

    if (sessionExpired) {
      try {
        handleFamileoTriggerRefresh(userEmail);
      } catch (refreshError) {
        logFamileoEvent('error', 'Famileo create post refresh error', userEmail, { error: String(refreshError) });
      }
      return createResponse({
        ok: false,
        error: { code: 'FAMILEO_SESSION', message: 'Session Famileo expirée. Rafraîchissement déclenché.' }
      });
    }

    if (result.status < 200 || result.status >= 300) {
      return createResponse({
        ok: false,
        error: { code: 'FAMILEO_ERROR', message: 'Famileo post failed (HTTP ' + result.status + ')' }
      });
    }

    return createResponse({
      ok: true,
      data: result
    });
  } catch (error) {
    logFamileoEvent('error', 'Famileo create post error', userEmail, { error: String(error) });
    return createResponse({
      ok: false,
      error: { code: 'FAMILEO_ERROR', message: String(error) }
    });
  }
}

/**
 * Handler for famileo/imported-fingerprints endpoint
 * Returns list of Famileo fingerprints that have already been imported
 */
function handleFamileoImportedFingerprints() {
  try {
    const fingerprints = getImportedFamileoFingerprints();

    return createResponse({
      ok: true,
      data: { fingerprints: fingerprints }
    });
  } catch (error) {
    Logger.log('Famileo imported-fingerprints error: ' + error);
    return createResponse({
      ok: false,
      error: { code: 'FAMILEO_ERROR', message: String(error) }
    });
  }
}

/**
 * Test function - run from Apps Script editor
 */
function testFamileo() {
  try {
    Logger.log('=== Testing Famileo fetch posts (first page) ===');
    const response1 = famileoFetchPosts(5);

    const posts1 = (response1.familyWall || []).map(post => ({
      id: post.wall_post_id,
      text: post.text.substring(0, 50) + '...',
      date: post.date,
      date_tz: post.date_tz,
      author_name: post.author_name
    }));

    Logger.log('First page - Posts count: ' + posts1.length);
    Logger.log('Posts: ' + JSON.stringify(posts1, null, 2));

    // Get next timestamp for pagination
    const lastPost = response1.familyWall[response1.familyWall.length - 1];
    const nextTimestamp = lastPost.date_tz;
    Logger.log('Next timestamp for pagination: ' + nextTimestamp);

    // Test pagination with timestamp
    Logger.log('=== Testing pagination with timestamp ===');
    const response2 = famileoFetchPosts(3, nextTimestamp);
    const posts2 = (response2.familyWall || []).map(post => ({
      id: post.wall_post_id,
      text: post.text.substring(0, 50) + '...',
      date: post.date,
      author_name: post.author_name
    }));
    Logger.log('Second page - Posts count: ' + posts2.length);
    Logger.log('Posts: ' + JSON.stringify(posts2, null, 2));

    // Test image fetch with first post
    if (response1.familyWall.length > 0) {
      const imageUrl = response1.familyWall[0].image_2x || response1.familyWall[0].image;
      Logger.log('=== Testing image fetch ===');
      Logger.log('URL: ' + imageUrl);
      const image = famileoFetchImage(imageUrl);
      Logger.log('Image fetched! MimeType: ' + image.mimeType + ', Base64 length: ' + image.base64.length);
    }
  } catch (error) {
    Logger.log('Test error: ' + error);
  }
}
