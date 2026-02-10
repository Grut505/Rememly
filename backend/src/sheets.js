// Google Sheets management

function getSpreadsheet() {
  const scriptProperties = PropertiesService.getScriptProperties();
  let spreadsheetId = scriptProperties.getProperty('SPREADSHEET_ID');

  if (!spreadsheetId) {
    // Create new spreadsheet
    const ss = SpreadsheetApp.create('Rememly Data');
    spreadsheetId = ss.getId();
    scriptProperties.setProperty('SPREADSHEET_ID', spreadsheetId);
    return ss;
  }

  return SpreadsheetApp.openById(spreadsheetId);
}

function getArticlesSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('articles');

  if (!sheet) {
    sheet = ss.insertSheet('articles');
    // Structure: id, date, auteur, texte, image_url, image_file_id, assembly_state, full_page, status, famileo_post_id
    sheet.appendRow(getArticlesHeaders());
  }

  ensureArticlesSheetColumns(sheet);
  return sheet;
}

function getArticlesHeaders() {
  return [
    'id',
    'date',
    'auteur',
    'texte',
    'image_url',
    'image_file_id',
    'assembly_state',
    'full_page',
    'status',
    'famileo_post_id',
    'famileo_fingerprint',
  ];
}

function ensureArticlesSheetColumns(sheet) {
  const expected = getArticlesHeaders();
  const lastCol = sheet.getLastColumn() || expected.length;
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  let updated = false;

  expected.forEach((header) => {
    if (!headers.includes(header)) {
      headers.push(header);
      updated = true;
    }
  });

  if (updated) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function getFamiliesSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('families');

  if (!sheet) {
    sheet = ss.insertSheet('families');
    sheet.appendRow(['id', 'name', 'famileo_id']);
  }

  return sheet;
}

function getFamilies() {
  const sheet = getFamiliesSheet();
  const data = sheet.getDataRange().getValues();
  const families = [];

  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) {
      families.push({
        id: data[i][0],
        name: data[i][1],
        famileo_id: data[i][2]
      });
    }
  }

  return families;
}

function getImportedFamileoPostIds() {
  const sheet = getArticlesSheet();
  const data = sheet.getDataRange().getValues();
  const ids = [];

  // Structure: id(0), date(1), auteur(2), texte(3), image_url(4), image_file_id(5), assembly_state(6), full_page(7), status(8), famileo_post_id(9)
  for (let i = 1; i < data.length; i++) {
    const famileoPostId = data[i][9];  // famileo_post_id is column 9 (0-indexed)
    const status = data[i][8];          // status is column 8 (0-indexed)
    if (famileoPostId && status !== 'DELETED') {
      ids.push(String(famileoPostId));
    }
  }

  return ids;
}

function getImportedFamileoFingerprints() {
  const sheet = getArticlesSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || [];
  const fingerprintIndex = headers.indexOf('famileo_fingerprint');
  const statusIndex = headers.indexOf('status');
  const authorIndex = headers.indexOf('auteur');
  const dateIndex = headers.indexOf('date');
  const textIndex = headers.indexOf('texte');
  if (fingerprintIndex === -1) return [];

  const fingerprints = [];
  for (let i = 1; i < data.length; i++) {
    const status = statusIndex === -1 ? '' : data[i][statusIndex];
    if (status === 'DELETED') continue;
    let fp = data[i][fingerprintIndex];
    const needsRehash = fp && (String(fp).includes('|') || String(fp).length !== 64);
    if ((!fp || needsRehash) && authorIndex !== -1 && dateIndex !== -1 && textIndex !== -1) {
      fp = buildFamileoFingerprint(data[i][authorIndex], data[i][dateIndex], data[i][textIndex]);
    }
    if (fp) fingerprints.push(String(fp));
  }
  return fingerprints;
}

function getJobsSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('jobs_pdf');

  if (!sheet) {
    sheet = ss.insertSheet('jobs_pdf');
    sheet.appendRow(getJobsHeaders());
  } else {
    ensureJobsSheetColumns(sheet);
  }

  return sheet;
}

function getPdfLogsSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('logs_pdf');

  if (!sheet) {
    sheet = ss.insertSheet('logs_pdf');
    sheet.appendRow(['timestamp', 'job_id', 'level', 'message', 'meta']);
  }

  return sheet;
}

function getFamileoLogsSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('logs_famileo');

  if (!sheet) {
    sheet = ss.insertSheet('logs_famileo');
    sheet.appendRow(['timestamp', 'level', 'message', 'user', 'meta']);
  }

  return sheet;
}

function logFamileoEvent(level, message, user, meta) {
  try {
    const sheet = getFamileoLogsSheet();
    const ts = new Date().toISOString();
    const metaStr = meta ? JSON.stringify(meta) : '';
    sheet.appendRow([ts, level || 'info', message || '', user || '', metaStr]);
  } catch (e) {
    Logger.log('Could not log famileo event: ' + e);
  }
}

function logPdfEvent(jobId, level, message, meta) {
  try {
    const sheet = getPdfLogsSheet();
    const ts = new Date().toISOString();
    const metaStr = meta ? JSON.stringify(meta) : '';
    sheet.appendRow([ts, jobId || '', level, message, metaStr]);
  } catch (e) {
    // Avoid throwing from logger
  }
}

function getPdfLogsRange() {
  const sheet = getPdfLogsSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { min: null, max: null, count: 0 };
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let min = null;
  let max = null;
  let count = 0;

  for (let i = 0; i < data.length; i++) {
    const value = data[i][0];
    if (!value) continue;
    const d = new Date(value);
    if (isNaN(d.getTime())) continue;
    const ts = d.toISOString();
    if (!min || ts < min) min = ts;
    if (!max || ts > max) max = ts;
    count++;
  }

  return { min, max, count };
}

function clearPdfLogsRange(fromIso, toIso) {
  const sheet = getPdfLogsSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { deleted: 0, remaining: 0 };
  }

  const from = fromIso ? new Date(fromIso) : null;
  const to = toIso ? new Date(toIso) : null;
  if ((from && isNaN(from.getTime())) || (to && isNaN(to.getTime()))) {
    throw new Error('Invalid date range');
  }

  const data = sheet.getDataRange().getValues();
  const header = data[0];
  const rows = data.slice(1);
  const keep = [];
  let deleted = 0;

  for (let i = 0; i < rows.length; i++) {
    const ts = rows[i][0];
    const d = ts ? new Date(ts) : null;
    const inRange = d && !isNaN(d.getTime()) &&
      (!from || d >= from) &&
      (!to || d <= to);
    if (inRange) {
      deleted++;
    } else {
      keep.push(rows[i]);
    }
  }

  sheet.clearContents();
  sheet.getRange(1, 1, 1, header.length).setValues([header]);
  if (keep.length > 0) {
    sheet.getRange(2, 1, keep.length, header.length).setValues(keep);
  }

  return { deleted, remaining: keep.length };
}

function getJobsHeaders() {
  return [
    'job_id',
    'created_at',
    'created_by',
    'date_from',
    'date_to',
    'status',
    'progress',
    'pdf_file_id',
    'pdf_url',
    'error_message',
    'progress_message',
    'chunks_folder_id',
    'chunks_folder_url',
  ];
}

function ensureJobsSheetColumns(sheet) {
  const expected = getJobsHeaders();
  const lastCol = sheet.getLastColumn() || expected.length;
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  let updated = false;
  const lastRow = sheet.getLastRow();

  // If legacy "year" column exists and sheet is empty, reset headers
  if (headers.includes('year') && lastRow <= 1) {
    sheet.clearContents();
    sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
    return;
  }

  expected.forEach((header) => {
    if (!headers.includes(header)) {
      headers.push(header);
      updated = true;
    }
  });

  if (updated) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function getUsersHeaders() {
  return [
    'email',
    'pseudo',
    'famileo_email',
    'famileo_name',
    'famileo_password_enc',
    'avatar_url',
    'avatar_file_id',
    'status',
    'date_created',
    'date_updated',
  ];
}

function ensureUsersSheetColumns(sheet) {
  const expected = getUsersHeaders();
  const lastCol = sheet.getLastColumn() || expected.length;
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  let updated = false;

  expected.forEach((header) => {
    if (!headers.includes(header)) {
      headers.push(header);
      updated = true;
    }
  });

  if (updated) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  const headerMap = getUsersHeaderMap(sheet);
  const statusIndex = headerMap.status;
  const emailIndex = headerMap.email;
  const lastRow = sheet.getLastRow();

  if (statusIndex === undefined || emailIndex === undefined || lastRow <= 1) return;

  const numRows = lastRow - 1;
  const statusRange = sheet.getRange(2, statusIndex + 1, numRows, 1);
  const emailRange = sheet.getRange(2, emailIndex + 1, numRows, 1);
  const statuses = statusRange.getValues();
  const emails = emailRange.getValues();
  let dirty = false;

  for (let i = 0; i < numRows; i++) {
    if (emails[i][0] && !statuses[i][0]) {
      statuses[i][0] = 'ACTIVE';
      dirty = true;
    }
  }

  if (dirty) {
    statusRange.setValues(statuses);
  }
}

function getUsersHeaderMap(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn() || getUsersHeaders().length)
    .getValues()[0];
  const map = {};
  headers.forEach((header, index) => {
    if (header && map[header] === undefined) map[header] = index;
  });
  return map;
}

function appendUserRow(sheet, valuesByHeader) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map((header) => (header in valuesByHeader ? valuesByHeader[header] : ''));
  sheet.appendRow(row);
}

function getUsersSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('users');

  if (!sheet) {
    sheet = ss.insertSheet('users');
    sheet.appendRow(getUsersHeaders());
  }

  ensureUsersSheetColumns(sheet);
  return sheet;
}

function normalizeEmail(email) {
  if (!email) return '';
  return String(email).trim().toLowerCase();
}

function getUserRowData(row, headerMap) {
  return {
    email: row[headerMap.email],
    pseudo: headerMap.pseudo === undefined ? null : row[headerMap.pseudo],
    famileo_email: headerMap.famileo_email === undefined ? null : row[headerMap.famileo_email],
    famileo_name: headerMap.famileo_name === undefined ? null : row[headerMap.famileo_name],
    famileo_password_enc: headerMap.famileo_password_enc === undefined ? null : row[headerMap.famileo_password_enc],
    avatar_url: headerMap.avatar_url === undefined ? null : row[headerMap.avatar_url],
    avatar_file_id: headerMap.avatar_file_id === undefined ? null : row[headerMap.avatar_file_id],
    status: headerMap.status === undefined ? null : row[headerMap.status],
    date_created: headerMap.date_created === undefined ? null : row[headerMap.date_created],
    date_updated: headerMap.date_updated === undefined ? null : row[headerMap.date_updated],
  };
}

function normalizeFamileoName(name) {
  if (!name) return '';
  return String(name).trim().toLowerCase();
}

function buildFamileoAuthorMap() {
  const sheet = getUsersSheet();
  const headerMap = getUsersHeaderMap(sheet);
  const data = sheet.getDataRange().getValues();
  const famileoIndex = headerMap.famileo_name;
  const emailIndex = headerMap.email;
  if (famileoIndex === undefined || emailIndex === undefined) return {};

  const pseudoIndex = headerMap.pseudo;
  const statusIndex = headerMap.status;
  const map = {};

  for (let i = 1; i < data.length; i++) {
    const famileoName = data[i][famileoIndex];
    const email = data[i][emailIndex];
    if (!famileoName || !email) continue;
    const status = statusIndex === undefined ? '' : data[i][statusIndex];
    if (status && String(status).toUpperCase() !== 'ACTIVE') continue;
    const key = normalizeFamileoName(famileoName);
    if (!key) continue;
    if (!map[key]) {
      map[key] = {
        email,
        pseudo: pseudoIndex === undefined ? null : data[i][pseudoIndex],
        famileo_name: famileoName,
      };
    }
  }
  return map;
}

function findUserRowsByEmail(email) {
  const sheet = getUsersSheet();
  const headerMap = getUsersHeaderMap(sheet);
  const data = sheet.getDataRange().getValues();
  const emailIndex = headerMap.email;
  if (emailIndex === undefined) return [];
  const normalized = normalizeEmail(email);
  if (!normalized) return [];

  const matches = [];
  for (let i = 1; i < data.length; i++) {
    if (normalizeEmail(data[i][emailIndex]) === normalized) {
      matches.push({
        rowIndex: i + 1,
        data: getUserRowData(data[i], headerMap),
      });
    }
  }
  return matches;
}

function pickPreferredUserRow(matches) {
  if (matches.length === 0) return null;
  const active = matches.find((match) => String(match.data.status).toUpperCase() === 'ACTIVE');
  return active || matches[0];
}

function dedupeUserRows(email) {
  const sheet = getUsersSheet();
  const matches = findUserRowsByEmail(email);
  if (matches.length <= 1) return pickPreferredUserRow(matches);

  const keep = pickPreferredUserRow(matches);
  const toDelete = matches
    .filter((match) => match.rowIndex !== keep.rowIndex)
    .sort((a, b) => b.rowIndex - a.rowIndex);

  toDelete.forEach((match) => sheet.deleteRow(match.rowIndex));
  SpreadsheetApp.flush();
  return keep;
}

function getOrCreateUser(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const existing = findUserByEmail(normalized);
  if (existing) return existing;
  return addPendingUser(normalized);
}

function findUserByEmail(email) {
  const sheet = getUsersSheet();
  const headerMap = getUsersHeaderMap(sheet);
  const data = sheet.getDataRange().getValues();
  const emailIndex = headerMap.email;
  if (emailIndex === undefined) return null;
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  for (let i = 1; i < data.length; i++) {
    if (normalizeEmail(data[i][emailIndex]) === normalized) {
      return {
        ...getUserRowData(data[i], headerMap),
        rowIndex: i + 1,
      };
    }
  }
  return null;
}

function addPendingUser(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const lock = LockService.getScriptLock();
  const hasLock = lock.tryLock(2000);
  if (!hasLock) return null;

  try {
    const existing = dedupeUserRows(normalized);
    if (existing) return existing;

    const sheet = getUsersSheet();
    const now = new Date().toISOString();
    appendUserRow(sheet, {
      email: normalized,
      status: 'PENDING',
      date_created: now,
      date_updated: now,
    });

    SpreadsheetApp.flush();
    return findUserByEmail(normalized);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Build a cache of email -> pseudo for all users
 * Used to efficiently enrich articles with author pseudos
 */
function buildUserPseudoCache() {
  const sheet = getUsersSheet();
  const headerMap = getUsersHeaderMap(sheet);
  const data = sheet.getDataRange().getValues();
  const cache = {};
  const emailIndex = headerMap.email;
  const pseudoIndex = headerMap.pseudo;
  if (emailIndex === undefined) return cache;

  for (let i = 1; i < data.length; i++) {
    const email = data[i][emailIndex];
    const pseudo = pseudoIndex === undefined ? null : data[i][pseudoIndex];
    if (email) {
      cache[email] = pseudo || email.split('@')[0];
    }
  }
  return cache;
}

function findRowById(sheet, id) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      return i + 1;
    }
  }
  return -1;
}

function getConfigSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('config');

  if (!sheet) {
    sheet = ss.insertSheet('config');
    sheet.appendRow(['key', 'value', 'updated_at']);
  }

  return sheet;
}

function getConfigValue(key) {
  const sheet = getConfigSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      return data[i][1];
    }
  }
  return null;
}

function setConfigValue(key, value) {
  const sheet = getConfigSheet();
  const data = sheet.getDataRange().getValues();
  const now = new Date().toISOString();
  const valueStr = value === null || value === undefined ? '' : String(value);

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      const cell = sheet.getRange(i + 1, 2);
      cell.setNumberFormat('@');
      cell.setValue(valueStr);
      sheet.getRange(i + 1, 3).setValue(now);
      return;
    }
  }

  // Key not found, add new row
  const nextRow = data.length + 1;
  sheet.getRange(nextRow, 1, 1, 3).setValues([[key, valueStr, now]]);
  sheet.getRange(nextRow, 2).setNumberFormat('@');
}
