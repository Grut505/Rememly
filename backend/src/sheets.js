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

function findRowById(sheet, id) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      return i + 1;
    }
  }
  return -1;
}
