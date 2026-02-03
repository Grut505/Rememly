// User profile management

function handleProfileGet(email) {
  const profile = getProfileByEmail(email);
  return createResponse({ ok: true, data: profile });
}

function handleProfileSave(email, body) {
  const profile = saveProfile(email, body);
  return createResponse({ ok: true, data: profile });
}

function handleUsersList() {
  const sheet = getUsersSheet();
  const data = sheet.getDataRange().getValues();
  const headerMap = getUsersHeaderMap(sheet);
  const rows = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[headerMap.email]) continue;
    rows.push({
      email: row[headerMap.email],
      pseudo: headerMap.pseudo === undefined ? '' : row[headerMap.pseudo],
      famileo_name: headerMap.famileo_name === undefined ? '' : row[headerMap.famileo_name],
      avatar_url: headerMap.avatar_url === undefined ? '' : row[headerMap.avatar_url],
      avatar_file_id: headerMap.avatar_file_id === undefined ? '' : row[headerMap.avatar_file_id],
      status: headerMap.status === undefined ? '' : row[headerMap.status],
      date_created: headerMap.date_created === undefined ? '' : row[headerMap.date_created],
      date_updated: headerMap.date_updated === undefined ? '' : row[headerMap.date_updated],
    });
  }

  return createResponse({ ok: true, data: { users: rows } });
}

function getProfileByEmail(email) {
  const user = findUserByEmail(email);

  if (!user) {
    // Return default profile based on email
    return {
      email: email,
      pseudo: email.split('@')[0],
      famileo_name: '',
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
    famileo_name: user.famileo_name || '',
    avatar_url: user.avatar_url,
    avatar_file_id: user.avatar_file_id,
    avatar_base64: avatarBase64
  };
}

function saveProfile(email, body) {
  const sheet = getUsersSheet();
  const existingUser = findUserByEmail(email);
  const dateNow = new Date().toISOString();
  const famileoName = body.famileo_name || '';

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

  const headerMap = getUsersHeaderMap(sheet);

  if (existingUser) {
    // Update existing user
    if (headerMap.pseudo !== undefined) sheet.getRange(existingUser.rowIndex, headerMap.pseudo + 1).setValue(body.pseudo);
    if (headerMap.famileo_name !== undefined) sheet.getRange(existingUser.rowIndex, headerMap.famileo_name + 1).setValue(famileoName);
    if (headerMap.avatar_url !== undefined) sheet.getRange(existingUser.rowIndex, headerMap.avatar_url + 1).setValue(avatarUrl);
    if (headerMap.avatar_file_id !== undefined) sheet.getRange(existingUser.rowIndex, headerMap.avatar_file_id + 1).setValue(avatarFileId);
    if (headerMap.date_updated !== undefined) sheet.getRange(existingUser.rowIndex, headerMap.date_updated + 1).setValue(dateNow);
  } else {
    // Create new user
    appendUserRow(sheet, {
      email,
      pseudo: body.pseudo,
      famileo_name: famileoName,
      avatar_url: avatarUrl,
      avatar_file_id: avatarFileId,
      status: 'ACTIVE',
      date_created: dateNow,
      date_updated: dateNow,
    });
  }

  return {
    email: email,
    pseudo: body.pseudo,
    famileo_name: famileoName,
    avatar_url: avatarUrl,
    avatar_file_id: avatarFileId
  };
}
