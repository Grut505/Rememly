// Utility functions

function generateId() {
  return Utilities.getUuid();
}

function now() {
  return new Date().toISOString();
}

function getYear(dateString) {
  return new Date(dateString).getFullYear();
}

function formatTimestamp() {
  const nowDate = new Date();
  return Utilities.formatDate(nowDate, 'Europe/Paris', 'yyyyMMdd_HHmmss');
}

function base64ToBlob(base64, mimeType) {
  // Remove data:image/...;base64, prefix if present
  const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
  const decoded = Utilities.base64Decode(base64Data);
  return Utilities.newBlob(decoded, mimeType);
}
