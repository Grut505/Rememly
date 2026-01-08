// User profile management

function handleProfileGet(email) {
  const profile = getProfileByEmail(email);
  return createResponse({ ok: true, data: profile });
}

function handleProfileSave(email, body) {
  const profile = saveProfile(email, body);
  return createResponse({ ok: true, data: profile });
}

function getProfileByEmail(email) {
  const user = findUserByEmail(email);

  if (!user) {
    // Return default profile based on email
    return {
      email: email,
      pseudo: email.split('@')[0],
      avatar_url: '',
      avatar_file_id: '',
      avatar_base64: ''
    };
  }

  // Get avatar as base64 to avoid CORS and rate limiting issues
  let avatarBase64 = '';
  if (user.avatar_file_id) {
    try {
      const file = DriveApp.getFileById(user.avatar_file_id);
      const blob = file.getBlob();
      const bytes = blob.getBytes();
      avatarBase64 = Utilities.base64Encode(bytes);
    } catch (error) {
      Logger.log('Failed to get avatar base64: ' + error);
    }
  }

  return {
    email: user.email,
    pseudo: user.pseudo,
    avatar_url: user.avatar_url,
    avatar_file_id: user.avatar_file_id,
    avatar_base64: avatarBase64
  };
}

function saveProfile(email, body) {
  const sheet = getUsersSheet();
  const existingUser = findUserByEmail(email);
  const dateNow = new Date().toISOString();

  // Upload avatar if provided
  let avatarUrl = existingUser ? existingUser.avatar_url : '';
  let avatarFileId = existingUser ? existingUser.avatar_file_id : '';

  if (body.avatar) {
    // Delete old avatar if exists
    if (avatarFileId) {
      try {
        DriveApp.getFileById(avatarFileId).setTrashed(true);
      } catch (e) {
        console.log('Could not delete old avatar:', e);
      }
    }

    // Upload new avatar to Drive
    const avatarData = uploadImage(
      body.avatar,
      `avatar_${email}_${Date.now()}.jpg`,
      new Date().getFullYear(),
      'originals'
    );
    avatarUrl = avatarData.url;
    avatarFileId = avatarData.fileId;
  }

  if (existingUser) {
    // Update existing user
    sheet.getRange(existingUser.rowIndex, 2).setValue(body.pseudo); // pseudo
    sheet.getRange(existingUser.rowIndex, 3).setValue(avatarUrl); // avatar_url
    sheet.getRange(existingUser.rowIndex, 4).setValue(avatarFileId); // avatar_file_id
    sheet.getRange(existingUser.rowIndex, 6).setValue(dateNow); // date_updated
  } else {
    // Create new user
    sheet.appendRow([
      email,
      body.pseudo,
      avatarUrl,
      avatarFileId,
      dateNow,
      dateNow
    ]);
  }

  return {
    email: email,
    pseudo: body.pseudo,
    avatar_url: avatarUrl,
    avatar_file_id: avatarFileId
  };
}
