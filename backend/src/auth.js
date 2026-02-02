// Authentication and authorization

function checkAuth(authHeader, options = {}) {
  const allowPendingCreate = options.allowPendingCreate === true;
  // If no auth header provided, check session user
  if (!authHeader) {
    const sessionEmail = Session.getActiveUser().getEmail();
    if (sessionEmail && isEmailAuthorized(sessionEmail, allowPendingCreate)) {
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

  // Check if it's email-based auth (new format: "Email <email>")
  if (authHeader.startsWith('Email ')) {
    const email = authHeader.substring(6).trim();

    if (!email || !isEmailAuthorized(email, allowPendingCreate)) {
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
        email: email,
        name: email.split('@')[0],
      },
    };
  }

  // Legacy: Verify Google OAuth token (Bearer token)
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
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

  if (!isEmailAuthorized(tokenInfo.email, allowPendingCreate)) {
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

function isEmailAuthorized(email, allowPendingCreate) {
  if (!email) return false;
  const user = allowPendingCreate ? getOrCreateUser(email) : findUserByEmail(email);
  if (!user) return false;

  return String(user.status || '').toUpperCase() === 'ACTIVE';
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
