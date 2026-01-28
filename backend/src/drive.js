// Google Drive management

function getRootFolder() {
  const folders = DriveApp.getFoldersByName('Rememly');
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder('Rememly');
}

function ensureFolderStructure() {
  const rootFolder = getRootFolder();

  const getFolderOrCreate = (name) => {
    const folders = rootFolder.getFoldersByName(name);
    if (folders.hasNext()) {
      return folders.next();
    }
    return rootFolder.createFolder(name);
  };

  return {
    originals: getFolderOrCreate('originals'),
    assembled: getFolderOrCreate('assembled'),
    pdf: getFolderOrCreate('pdf'),
  };
}

function getPdfFolder() {
  const folders = ensureFolderStructure();
  return folders.pdf;
}

function createPdfJobFolder(jobId) {
  const pdfFolder = getPdfFolder();
  const name = `pdf_job_${jobId}`;
  const existing = pdfFolder.getFoldersByName(name);
  if (existing.hasNext()) {
    return existing.next();
  }
  return pdfFolder.createFolder(name);
}

function uploadImage(base64, fileName, year, folderType) {
  const folders = ensureFolderStructure();
  const folder = folders[folderType];

  const blob = base64ToBlob(base64, 'image/jpeg');
  blob.setName(fileName);

  const file = folder.createFile(blob);

  // Make file publicly viewable
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const fileId = file.getId();

  // Use file/d/ID/view format (same as articles) - will be converted to thumbnail on frontend
  return {
    fileId: fileId,
    url: `https://drive.google.com/file/d/${fileId}/view?usp=drivesdk`,
  };
}

function getImageUrl(fileId) {
  try {
    const file = DriveApp.getFileById(fileId);
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`;
  } catch (error) {
    return '';
  }
}

function savePdfToFolder(pdfBlob, fileName) {
  const folders = ensureFolderStructure();
  const pdfFolder = folders.pdf;

  const file = pdfFolder.createFile(pdfBlob);
  file.setName(fileName);

  return {
    fileId: file.getId(),
    url: file.getUrl(),
  };
}

function handleImageFetch(fileId) {
  Logger.log('handleImageFetch called with fileId: ' + fileId);

  if (!fileId) {
    Logger.log('ERROR: fileId is missing');
    return createResponse({
      ok: false,
      error: { code: 'INVALID_PARAMS', message: 'fileId is required' }
    });
  }

  try {
    Logger.log('Attempting to get file with ID: ' + fileId);
    const file = DriveApp.getFileById(fileId);
    Logger.log('File retrieved: ' + file.getName());

    const blob = file.getBlob();
    Logger.log('Blob size: ' + blob.getBytes().length);

    const bytes = blob.getBytes();
    const base64 = Utilities.base64Encode(bytes);
    Logger.log('Base64 encoded, length: ' + base64.length);

    return createResponse({
      ok: true,
      data: { base64: base64 }
    });
  } catch (error) {
    Logger.log('ERROR in handleImageFetch: ' + error.toString());
    return createResponse({
      ok: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch image from Drive: ' + error.toString() }
    });
  }
}
