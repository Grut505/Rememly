// Authentication and authorization

function checkAuth(token) {
  const scriptProperties = PropertiesService.getScriptProperties();
  const whitelistJson = scriptProperties.getProperty('AUTHORIZED_EMAILS');

  if (!whitelistJson) {
    return {
      ok: false,
      error: {
        code: 'AUTH_REQUIRED',
        message: 'No authorized users configured',
      },
    };
  }

  const whitelist = JSON.parse(whitelistJson);

  // If no token provided, check session user
  if (!token) {
    const sessionEmail = Session.getActiveUser().getEmail();
    if (sessionEmail && whitelist.includes(sessionEmail)) {
      return {
        ok: true,
        user: {
          email: sessionEmail,
          name: sessionEmail.split('@')[0],
        },
      };
    }
    return {
      ok: false,
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
      },
    };
  }

  // Verify Google OAuth token
  const tokenInfo = verifyGoogleToken(token);

  if (!tokenInfo || !tokenInfo.email) {
    return {
      ok: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid authentication token',
      },
    };
  }

  if (!whitelist.includes(tokenInfo.email)) {
    return {
      ok: false,
      error: {
        code: 'FORBIDDEN',
        message: 'User not authorized',
      },
    };
  }

  return {
    ok: true,
    user: {
      email: tokenInfo.email,
      name: tokenInfo.name || tokenInfo.email.split('@')[0],
    },
  };
}

function verifyGoogleToken(token) {
  // Verify Google access token
  try {
    const response = UrlFetchApp.fetch(
      'https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + encodeURIComponent(token)
    );
    return JSON.parse(response.getContentText());
  } catch (error) {
    Logger.log('Token verification error: ' + error);
    return null;
  }
}

function isEmailAuthorized(email) {
  const scriptProperties = PropertiesService.getScriptProperties();
  const whitelistJson = scriptProperties.getProperty('AUTHORIZED_EMAILS');

  if (!whitelistJson) return false;

  const whitelist = JSON.parse(whitelistJson);
  return whitelist.includes(email);
}

function handleAuthCheck(user) {
  return createResponse({
    ok: true,
    data: {
      user,
      timezone: 'Europe/Paris',
    },
  });
}
