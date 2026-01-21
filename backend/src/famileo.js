// Famileo API integration
// Credentials are stored in Script Properties (never in code)

// Allowed authors for filtering posts
// Key = Famileo author name, Value = user email (persistent identifier)
const FAMILEO_AUTHOR_MAPPING = {
  'Yann Graufogel': 'grutspam@gmail.com',
  'Marie Cabedoce': 'mariealex@gmail.com'
};

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

/**
 * Get stored session cookies
 * First tries to read from Config sheet (updated by GitHub Actions)
 * Falls back to Script Properties (legacy/manual method)
 */
function getFamileoSession() {
  // Try Config sheet first (populated by GitHub Actions)
  const configSession = getConfigValue('famileo_session');
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

    if (!expectedToken) {
      return createResponse({
        ok: false,
        error: { code: 'NOT_CONFIGURED', message: 'Update token not configured in Script Properties' }
      });
    }

    if (body.token !== expectedToken) {
      return createResponse({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid token' }
      });
    }

    // Validate session data
    if (!body.phpsessid || !body.rememberme) {
      return createResponse({
        ok: false,
        error: { code: 'INVALID_DATA', message: 'Missing phpsessid or rememberme' }
      });
    }

    // Store session in Config sheet
    const session = {
      PHPSESSID: body.phpsessid,
      REMEMBERME: body.rememberme
    };
    setConfigValue('famileo_session', JSON.stringify(session));

    // Optionally update family ID
    if (body.familyId) {
      setConfigValue('famileo_family_id', body.familyId);
    }

    Logger.log('Famileo session updated via API');

    return createResponse({
      ok: true,
      data: { message: 'Session updated successfully' }
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
function famileoFetchPosts(limit = 20, timestamp = null, familyId = null) {
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
function handleFamileoPosts(params) {
  try {
    const limit = parseInt(params.limit) || 20;
    const timestamp = params.timestamp || null;
    const familyId = params.family_id || null;

    const response = famileoFetchPosts(limit, timestamp, familyId);

    // Extract only the fields we need and filter by allowed authors
    const allowedAuthors = Object.keys(FAMILEO_AUTHOR_MAPPING);

    // Cache for user profiles to avoid multiple lookups
    const userProfileCache = {};

    const posts = (response.familyWall || [])
      .filter(post => allowedAuthors.includes(post.author_name))
      .map(post => {
        const authorEmail = FAMILEO_AUTHOR_MAPPING[post.author_name];

        // Get pseudo from Users sheet (cached)
        let authorPseudo;
        if (userProfileCache[authorEmail]) {
          authorPseudo = userProfileCache[authorEmail];
        } else {
          const user = findUserByEmail(authorEmail);
          // Use user's pseudo if exists, otherwise use first name from Famileo
          authorPseudo = user ? user.pseudo : post.author_name.split(' ')[0];
          userProfileCache[authorEmail] = authorPseudo;
        }

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
    const rawPosts = response.familyWall || [];
    if (rawPosts.length > 0) {
      const lastRawPost = rawPosts[rawPosts.length - 1];
      // Use date_tz if available, otherwise convert date to ISO
      nextTimestamp = lastRawPost.date_tz || new Date(lastRawPost.date).toISOString();
    }

    return createResponse({
      ok: true,
      data: {
        posts: posts,
        unread: response.unreadPost || 0,
        next_timestamp: nextTimestamp,
        has_more: rawPosts.length === limit
      }
    });
  } catch (error) {
    Logger.log('Famileo posts error: ' + error);
    return createResponse({
      ok: false,
      error: { code: 'FAMILEO_ERROR', message: String(error) }
    });
  }
}

/**
 * Fetch a Famileo image and return as base64
 */
function famileoFetchImage(imageUrl) {
  if (!imageUrl || !imageUrl.includes('cloudfront.net')) {
    throw new Error('Invalid Famileo image URL');
  }

  const session = getFamileoSession();

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
 * Handler for famileo/image endpoint
 */
function handleFamileoImage(params) {
  try {
    const imageUrl = params.url;
    if (!imageUrl) {
      return createResponse({
        ok: false,
        error: { code: 'MISSING_URL', message: 'Image URL required' }
      });
    }

    const image = famileoFetchImage(decodeURIComponent(imageUrl));

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
function handleFamileoStatus() {
  try {
    const props = PropertiesService.getScriptProperties();
    const sessionJson = props.getProperty('FAMILEO_SESSION');

    if (!sessionJson) {
      return createResponse({
        ok: true,
        data: { configured: false, message: 'No session configured' }
      });
    }

    return createResponse({
      ok: true,
      data: { configured: true, message: 'Session configured' }
    });
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
function handleFamileoTriggerRefresh() {
  try {
    const props = PropertiesService.getScriptProperties();
    const githubToken = props.getProperty('GITHUB_TOKEN');

    if (!githubToken) {
      return createResponse({
        ok: false,
        error: { code: 'NOT_CONFIGURED', message: 'GitHub token not configured in Script Properties' }
      });
    }

    // Trigger the workflow via GitHub API
    const response = UrlFetchApp.fetch(
      'https://api.github.com/repos/Grut505/Rememly/actions/workflows/famileo-refresh.yml/dispatches',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + githubToken,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        payload: JSON.stringify({ ref: 'main' }),
        muteHttpExceptions: true
      }
    );

    const responseCode = response.getResponseCode();
    Logger.log('GitHub API response code: ' + responseCode);

    if (responseCode === 204) {
      return createResponse({
        ok: true,
        data: { message: 'Workflow triggered successfully. Session will be refreshed in ~2 minutes.' }
      });
    } else {
      const responseText = response.getContentText();
      Logger.log('GitHub API error: ' + responseText);
      return createResponse({
        ok: false,
        error: { code: 'GITHUB_ERROR', message: 'Failed to trigger workflow: HTTP ' + responseCode }
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
