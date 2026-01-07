// Google Drive management

function getRootFolder() {
  const folders = DriveApp.getFoldersByName('Rememly');
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder('Rememly');
}

function getYearFolder(year) {
  const rootFolder = getRootFolder();
  const yearName = year.toString();

  const folders = rootFolder.getFoldersByName(yearName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return rootFolder.createFolder(yearName);
}

function ensureFolderStructure(year) {
  const yearFolder = getYearFolder(year);

  const getFolderOrCreate = (name) => {
    const folders = yearFolder.getFoldersByName(name);
    if (folders.hasNext()) {
      return folders.next();
    }
    return yearFolder.createFolder(name);
  };

  return {
    originals: getFolderOrCreate('originals'),
    assembled: getFolderOrCreate('assembled'),
    pdf: getFolderOrCreate('pdf'),
  };
}

function uploadImage(base64, fileName, year, folderType) {
  const folders = ensureFolderStructure(year);
  const folder = folders[folderType];

  const blob = base64ToBlob(base64, 'image/jpeg');
  blob.setName(fileName);

  const file = folder.createFile(blob);

  return {
    fileId: file.getId(),
    url: file.getUrl(),
  };
}

function getImageUrl(fileId) {
  try {
    const file = DriveApp.getFileById(fileId);
    return file.getUrl();
  } catch (error) {
    return '';
  }
}

function savePdfToFolder(pdfBlob, year, fileName) {
  const folders = ensureFolderStructure(year);
  const pdfFolder = folders.pdf;

  const file = pdfFolder.createFile(pdfBlob);
  file.setName(fileName);

  return {
    fileId: file.getId(),
    url: file.getUrl(),
  };
}
