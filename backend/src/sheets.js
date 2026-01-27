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

function getJobsHeaders() {
  return [
    'job_id',
    'created_at',
    'created_by',
    'year',
    'date_from',
    'date_to',
    'status',
    'progress',
    'pdf_file_id',
    'pdf_url',
    'error_message',
    'progress_message',
    'temp_folder_id',
    'temp_folder_url',
  ];
}

function ensureJobsSheetColumns(sheet) {
  const expected = getJobsHeaders();
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
