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
    sheet.appendRow([
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
    ]);
  }

  return sheet;
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

function getUsersSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('users');

  if (!sheet) {
    sheet = ss.insertSheet('users');
    sheet.appendRow([
      'email',
      'pseudo',
      'avatar_url',
      'avatar_file_id',
      'date_created',
      'date_updated',
    ]);
  }

  return sheet;
}

function findUserByEmail(email) {
  const sheet = getUsersSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === email) {
      return {
        email: data[i][0],
        pseudo: data[i][1],
        avatar_url: data[i][2],
        avatar_file_id: data[i][3],
        date_created: data[i][4],
        date_updated: data[i][5],
        rowIndex: i + 1
      };
    }
  }
  return null;
}

/**
 * Build a cache of email -> pseudo for all users
 * Used to efficiently enrich articles with author pseudos
 */
function buildUserPseudoCache() {
  const sheet = getUsersSheet();
  const data = sheet.getDataRange().getValues();
  const cache = {};
  for (let i = 1; i < data.length; i++) {
    const email = data[i][0];
    const pseudo = data[i][1];
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

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      sheet.getRange(i + 1, 3).setValue(now);
      return;
    }
  }

  // Key not found, add new row
  sheet.appendRow([key, value, now]);
}
