// PDF Jobs management

function createJob(from, to, userEmail) {
  const sheet = getJobsSheet();
  const jobId = generateId();
  const dateNow = now();
  const headerMap = getJobsHeaderIndexMap(sheet);
  const colCount = sheet.getLastColumn();
  const row = new Array(colCount).fill('');

  row[headerMap.job_id] = jobId;
  row[headerMap.created_at] = dateNow;
  row[headerMap.created_by] = userEmail;
  if (headerMap.year !== undefined) {
    row[headerMap.year] = getYear(from);
  }
  row[headerMap.date_from] = from;
  row[headerMap.date_to] = to;
  row[headerMap.status] = 'PENDING';
  row[headerMap.progress] = 0;
  row[headerMap.pdf_file_id] = '';
  row[headerMap.pdf_url] = '';
  row[headerMap.error_message] = '';
  row[headerMap.progress_message] = '';
  if (headerMap.chunks_folder_id !== undefined) row[headerMap.chunks_folder_id] = '';
  if (headerMap.chunks_folder_url !== undefined) row[headerMap.chunks_folder_url] = '';

  sheet.appendRow(row);
  return jobId;
}

function getJobStatus(jobId) {
  const sheet = getJobsSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[0] === jobId) {
      const job = {};
      headers.forEach((header, index) => {
        job[header] = row[index];
      });
      return job;
    }
  }

  return null;
}

function updateJobStatus(
  jobId,
  status,
  progress,
  pdfFileId,
  pdfUrl,
  errorMessage,
  progressMessage
) {
  const sheet = getJobsSheet();
  const rowIndex = findRowById(sheet, jobId);

  if (rowIndex === -1) return;

  const headerMap = getJobsHeaderIndexMap(sheet);
  const colCount = sheet.getLastColumn();
  const row = sheet.getRange(rowIndex, 1, 1, colCount).getValues()[0];

  row[headerMap.status] = status;
  if (progress !== undefined) row[headerMap.progress] = progress;
  if (pdfFileId !== undefined) row[headerMap.pdf_file_id] = pdfFileId;
  if (pdfUrl !== undefined) row[headerMap.pdf_url] = pdfUrl;
  if (errorMessage !== undefined) row[headerMap.error_message] = errorMessage;
  if (progressMessage !== undefined) row[headerMap.progress_message] = progressMessage;

  sheet.getRange(rowIndex, 1, 1, colCount).setValues([row]);
}

function getJobsHeaderIndexMap(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((header, index) => {
    map[header] = index;
  });
  return map;
}

function getAllJobIdsSet() {
  const sheet = getJobsSheet();
  const data = sheet.getDataRange().getValues();
  const ids = new Set();
  for (let i = 1; i < data.length; i++) {
    const id = data[i][0];
    if (id) ids.add(String(id));
  }
  return ids;
}

function getJobIdByChunksFolderId(folderId) {
  if (!folderId) return null;
  const sheet = getJobsSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idx = headers.indexOf('chunks_folder_id');
  if (idx === -1) return null;

  for (let i = 1; i < data.length; i++) {
    if (data[i][idx] === folderId) {
      return data[i][0];
    }
  }
  return null;
}

function updateJobChunksFolder(jobId, folderId, folderUrl) {
  const sheet = getJobsSheet();
  const rowIndex = findRowById(sheet, jobId);

  if (rowIndex === -1) return;

  const headerMap = getJobsHeaderIndexMap(sheet);
  const colCount = sheet.getLastColumn();
  const row = sheet.getRange(rowIndex, 1, 1, colCount).getValues()[0];

  if (folderId !== undefined) row[headerMap.chunks_folder_id] = folderId;
  if (folderUrl !== undefined) row[headerMap.chunks_folder_url] = folderUrl;

  sheet.getRange(rowIndex, 1, 1, colCount).setValues([row]);
}

function handlePdfStatus(jobId) {
  const job = getJobStatus(jobId);

  if (!job) {
    return createResponse({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Job not found' },
    });
  }

  return createResponse({
    ok: true,
    data: job,
  });
}

/**
 * Convert a value to ISO string if it's a Date
 */
function toIsoString(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

/**
 * Get all PDF jobs, optionally filtered by date range and author
 * @param {string} dateFrom - Filter by creation date (start)
 * @param {string} dateTo - Filter by creation date (end)
 * @param {string} author - Filter by author email
 * @param {boolean} includeInProgress - If true, include PENDING and RUNNING jobs
 */
function getAllPdfJobs(dateFrom, dateTo, author, includeInProgress) {
  const sheet = getJobsSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const userPseudoCache = buildUserPseudoCache();

  const jobs = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const job = {};
    headers.forEach((header, index) => {
      // Convert dates to ISO strings for proper JSON serialization
      job[header] = toIsoString(row[index]);
    });
    if (job.created_by) {
      job.created_by_pseudo = userPseudoCache[job.created_by] || String(job.created_by).split('@')[0];
    }

    // Filter by status
    if (includeInProgress) {
      // Include all valid statuses (including CANCELLED for history)
      if (!['PENDING', 'RUNNING', 'DONE', 'ERROR', 'CANCELLED'].includes(job.status)) continue;
      // Skip DONE jobs without PDF URL (incomplete)
      if (job.status === 'DONE' && !job.pdf_url) continue;
    } else {
      // Only include completed jobs (DONE with URL, ERROR, or CANCELLED)
      if (job.status === 'DONE' && !job.pdf_url) continue;
      if (!['DONE', 'ERROR', 'CANCELLED'].includes(job.status)) continue;
    }

    // Apply author filter if provided (only for completed jobs)
    if (author && job.created_by !== author) continue;

    // Apply date filters if provided (only for completed jobs)
    if (dateFrom && job.created_at) {
      const createdDate = new Date(job.created_at);
      const filterFrom = new Date(dateFrom);
      if (createdDate < filterFrom) continue;
    }
    if (dateTo && job.created_at) {
      const createdDate = new Date(job.created_at);
      const filterTo = new Date(dateTo);
      filterTo.setDate(filterTo.getDate() + 1); // Include the whole day
      if (createdDate >= filterTo) continue;
    }

    jobs.push(job);
  }

  // Sort by created_at DESC (newest first)
  jobs.sort((a, b) => {
    const dateA = new Date(a.created_at || 0);
    const dateB = new Date(b.created_at || 0);
    return dateB - dateA;
  });

  return jobs;
}

function handlePdfList(params) {
  const includeInProgress = params.include_in_progress === 'true' || params.include_in_progress === true;
  const jobs = getAllPdfJobs(params.date_from, params.date_to, params.author, includeInProgress);

  // Get unique authors for filter dropdown (only from completed jobs)
  const completedJobs = jobs.filter(j => j.status === 'DONE' || j.status === 'ERROR');
  const authors = [...new Set(completedJobs.map(j => j.created_by).filter(Boolean))];

  return createResponse({
    ok: true,
    data: {
      items: jobs,
      authors: authors
    },
  });
}

/**
 * Delete a PDF job and its associated file from Drive
 */
function deletePdfJob(jobId) {
  const sheet = getJobsSheet();
  const rowIndex = findRowById(sheet, jobId);

  if (rowIndex === -1) {
    return { ok: false, error: 'Job not found' };
  }

  const headerMap = getJobsHeaderIndexMap(sheet);
  const colCount = sheet.getLastColumn();
  // Get the job data to find the file ID
  const row = sheet.getRange(rowIndex, 1, 1, colCount).getValues()[0];
  const pdfFileId = row[headerMap.pdf_file_id];
  const chunksFolderId = row[headerMap.chunks_folder_id];

  // Delete the file from Drive if it exists
  if (pdfFileId) {
    try {
      const file = DriveApp.getFileById(pdfFileId);
      file.setTrashed(true);
    } catch (e) {
      // File might already be deleted, continue anyway
    }
  }

  if (chunksFolderId) {
    try {
      const folder = DriveApp.getFolderById(chunksFolderId);
      folder.setTrashed(true);
    } catch (e) {
      // Folder might already be deleted, continue anyway
    }
  }

  // Delete the row from the sheet
  sheet.deleteRow(rowIndex);

  return { ok: true };
}

function handlePdfDelete(body) {
  const jobId = body.job_id;
  if (!jobId) {
    return createResponse({
      ok: false,
      error: { code: 'MISSING_JOB_ID', message: 'Job ID is required' },
    });
  }

  const result = deletePdfJob(jobId);

  if (!result.ok) {
    return createResponse({
      ok: false,
      error: { code: 'NOT_FOUND', message: result.error },
    });
  }

  return createResponse({
    ok: true,
    data: { deleted: true },
  });
}
