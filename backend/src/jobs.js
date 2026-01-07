// PDF Jobs management

function createJob(from, to, userEmail) {
  const sheet = getJobsSheet();
  const jobId = generateId();
  const dateNow = now();
  const year = getYear(from);

  const row = [
    jobId,
    dateNow,
    userEmail,
    year,
    from,
    to,
    'PENDING',
    0,
    '',
    '',
    '',
  ];

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
  errorMessage
) {
  const sheet = getJobsSheet();
  const rowIndex = findRowById(sheet, jobId);

  if (rowIndex === -1) return;

  const row = sheet.getRange(rowIndex, 1, 1, 11).getValues()[0];

  row[6] = status;
  if (progress !== undefined) row[7] = progress;
  if (pdfFileId !== undefined) row[8] = pdfFileId;
  if (pdfUrl !== undefined) row[9] = pdfUrl;
  if (errorMessage !== undefined) row[10] = errorMessage;

  sheet.getRange(rowIndex, 1, 1, 11).setValues([row]);
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
