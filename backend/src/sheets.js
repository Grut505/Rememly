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
    sheet.appendRow([
      'id',
      'date_creation',
      'date_modification',
      'auteur',
      'texte',
      'image_url',
      'image_file_id',
      'year',
      'assembly_state',
      'full_page',
      'status',
    ]);
  }

  return sheet;
}

function getJobsSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('jobs_pdf');

  if (!sheet) {
    sheet = ss.insertSheet('jobs_pdf');
    sheet.appendRow([
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
    ]);
  }

  return sheet;
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

function findRowById(sheet, id) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      return i + 1;
    }
  }
  return -1;
}
