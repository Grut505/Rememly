// PDF Generation - Batch Architecture with Triggers
// Generates PDFs in chunks using time-driven triggers to avoid timeouts

function handlePdfCreate(body, user) {
  const jobId = createJob(body.from, body.to, user.email);

  // Store options in script properties for async processing
  const props = PropertiesService.getScriptProperties();
  props.setProperty('PDF_OPTIONS_' + jobId, JSON.stringify({
    mosaicLayout: body.options?.mosaic_layout || 'full',
    showSeasonalFruits: body.options?.show_seasonal_fruits !== false,
    maxMosaicPhotos: body.options?.max_mosaic_photos || undefined
  }));

  // Return immediately with PENDING status
  // Frontend will call pdf/process to trigger the actual generation
  return createResponse({
    ok: true,
    data: {
      job_id: jobId,
      status: 'PENDING',
      progress: 0,
      progress_message: 'En attente...',
    },
  });
}

// Called by frontend "fire and forget" to trigger the batch processing
function handlePdfProcess(params) {
  const jobId = params.job_id;
  if (!jobId) {
    return createResponse({
      ok: false,
      error: { code: 'MISSING_JOB_ID', message: 'Job ID is required' },
    });
  }

  // Initialize the batch state and start processing
  initializeBatchState(jobId);

  // Add job to the processing queue
  const props = PropertiesService.getScriptProperties();
  const queue = JSON.parse(props.getProperty('PDF_JOB_QUEUE') || '[]');
  if (!queue.includes(jobId)) {
    queue.push(jobId);
    props.setProperty('PDF_JOB_QUEUE', JSON.stringify(queue));
  }

  // Create a trigger to process the queue
  // This allows the request to return immediately
  const trigger = ScriptApp.newTrigger('processPdfBatchTrigger')
    .timeBased()
    .after(1000) // 1 second delay
    .create();

  Logger.log('Created trigger for job ' + jobId + ', trigger ID: ' + trigger.getUniqueId());

  return createResponse({
    ok: true,
    data: { processed: true, job_id: jobId },
  });
}

/**
 * Cancel a PDF generation job
 * Sets status to CANCELLED and cleans up batch state
 */
function handlePdfCancel(params) {
  const jobId = params.job_id;
  if (!jobId) {
    return createResponse({
      ok: false,
      error: { code: 'MISSING_JOB_ID', message: 'Job ID is required' },
    });
  }

  const job = getJobStatus(jobId);
  if (!job) {
    return createResponse({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Job not found' },
    });
  }

  // Only allow cancelling PENDING or RUNNING jobs
  if (job.status !== 'PENDING' && job.status !== 'RUNNING') {
    return createResponse({
      ok: false,
      error: { code: 'INVALID_STATUS', message: 'Job cannot be cancelled' },
    });
  }

  // Update status to CANCELLED
  updateJobStatus(jobId, 'CANCELLED', 0, undefined, undefined, undefined, 'Annulé');

  // Clean up batch state and temp files
  cleanupBatchState(jobId);

  Logger.log('Job cancelled: ' + jobId);

  return createResponse({
    ok: true,
    data: { cancelled: true, job_id: jobId },
  });
}

/**
 * Initialize the batch state for a PDF job
 */
function initializeBatchState(jobId) {
  const props = PropertiesService.getScriptProperties();

  updateJobStatus(jobId, 'RUNNING', 5, undefined, undefined, undefined, 'Initialisation...');

  const job = getJobStatus(jobId);
  if (!job) {
    throw new Error('Job not found');
  }

  // Get articles and group by month
  const articles = getArticlesInRange(job.date_from, job.date_to);
  const articlesByMonth = groupArticlesByMonth(articles);
  const monthKeys = Object.keys(articlesByMonth).sort();

  // Calculate total pages for page numbering
  let totalPages = 1; // cover page
  for (const monthKey of monthKeys) {
    totalPages += 1; // month divider
    totalPages += Math.ceil(articlesByMonth[monthKey].length / 2);
  }

  // Create temp folder for partial PDFs
  const tempFolder = DriveApp.createFolder('_pdf_batch_' + jobId);

  // Store batch state
  const batchState = {
    jobId: jobId,
    currentChunk: 0, // 0 = cover, 1+ = months
    totalChunks: monthKeys.length + 1, // cover + all months
    monthKeys: monthKeys,
    totalPages: totalPages,
    currentPage: 1,
    tempFolderId: tempFolder.getId(),
    partialPdfIds: [],
    articlesCount: articles.length
  };

  props.setProperty('PDF_BATCH_STATE_' + jobId, JSON.stringify(batchState));

  updateJobStatus(jobId, 'RUNNING', 10, undefined, undefined, undefined, `${articles.length} articles trouvés`);
}

/**
 * Trigger function that processes one chunk at a time
 * Called by time-driven triggers
 */
function processPdfBatchTrigger(e) {
  const props = PropertiesService.getScriptProperties();
  let jobId = null;

  // Delete the trigger itself first
  if (e && e.triggerUid) {
    const triggerId = e.triggerUid;

    // Method 1: Check if this trigger has an associated job ID (set by processNextPdfChunk)
    jobId = props.getProperty('PDF_TRIGGER_' + triggerId);
    if (jobId) {
      props.deleteProperty('PDF_TRIGGER_' + triggerId);
    }

    // Delete the trigger
    const triggers = ScriptApp.getProjectTriggers();
    for (const trigger of triggers) {
      if (trigger.getUniqueId() === triggerId) {
        ScriptApp.deleteTrigger(trigger);
        break;
      }
    }
  }

  // Method 2: Fall back to queue if no job ID found (initial trigger from handlePdfProcess)
  if (!jobId) {
    const queue = JSON.parse(props.getProperty('PDF_JOB_QUEUE') || '[]');
    if (queue.length > 0) {
      jobId = queue.shift(); // Take first job from queue
      props.setProperty('PDF_JOB_QUEUE', JSON.stringify(queue));
      Logger.log('Got job from queue: ' + jobId);
    }
  }

  if (!jobId) {
    Logger.log('No job ID found in trigger or queue');
    return;
  }

  Logger.log('Processing job: ' + jobId);

  // Process the next chunk
  processNextPdfChunk(jobId);
}

/**
 * Process the next chunk of the PDF batch
 */
function processNextPdfChunk(jobId) {
  const props = PropertiesService.getScriptProperties();

  try {
    // Get batch state
    const stateJson = props.getProperty('PDF_BATCH_STATE_' + jobId);
    if (!stateJson) {
      throw new Error('Batch state not found');
    }
    const state = JSON.parse(stateJson);

    const job = getJobStatus(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    // Check if job has been cancelled
    if (job.status === 'CANCELLED') {
      Logger.log('Job ' + jobId + ' has been cancelled, stopping processing');
      cleanupBatchState(jobId);
      return;
    }

    // Get options
    const optionsJson = props.getProperty('PDF_OPTIONS_' + jobId);
    const pdfOptions = optionsJson ? JSON.parse(optionsJson) : {
      mosaicLayout: 'full',
      showSeasonalFruits: true
    };

    const monthsFr = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

    const tempFolder = DriveApp.getFolderById(state.tempFolderId);

    if (state.currentChunk === 0) {
      // Generate cover page
      const progress = 15;
      updateJobStatus(jobId, 'RUNNING', progress, undefined, undefined, undefined, 'Génération de la couverture...');

      const articles = getArticlesInRange(job.date_from, job.date_to);
      const coverHtml = generateCoverOnlyHtml(articles, job.date_from, job.date_to, pdfOptions.maxMosaicPhotos);
      const coverPdf = convertHtmlToPdf(coverHtml);

      // Save to temp folder
      const coverFile = tempFolder.createFile(coverPdf);
      coverFile.setName('chunk_000_cover.pdf');
      state.partialPdfIds.push(coverFile.getId());

      state.currentChunk = 1;
      state.currentPage = 1;

    } else if (state.currentChunk <= state.monthKeys.length) {
      // Generate month chunk
      const monthIndex = state.currentChunk - 1;
      const monthKey = state.monthKeys[monthIndex];
      const [yearStr, monthStr] = monthKey.split('-');
      const monthIdx = parseInt(monthStr);
      const monthName = monthsFr[monthIdx];

      const progress = Math.round(15 + (state.currentChunk / state.totalChunks) * 65);
      updateJobStatus(jobId, 'RUNNING', progress, undefined, undefined, undefined, `Génération de ${monthName} ${yearStr}...`);

      // Get articles for this month
      const articles = getArticlesInRange(job.date_from, job.date_to);
      const articlesByMonth = groupArticlesByMonth(articles);
      const monthArticles = articlesByMonth[monthKey];

      // Generate month PDF
      const monthHtml = generateMonthOnlyHtml(monthArticles, monthName, yearStr, monthIdx, state.currentPage, state.totalPages, pdfOptions);
      const monthPdf = convertHtmlToPdf(monthHtml);

      // Save to temp folder
      const monthFile = tempFolder.createFile(monthPdf);
      monthFile.setName(`chunk_${String(state.currentChunk).padStart(3, '0')}_${monthKey}.pdf`);
      state.partialPdfIds.push(monthFile.getId());

      // Update page counter for next chunk
      state.currentPage += 1 + Math.ceil(monthArticles.length / 2);
      state.currentChunk++;
    }

    // Save updated state
    props.setProperty('PDF_BATCH_STATE_' + jobId, JSON.stringify(state));

    // Check if all chunks are done
    if (state.currentChunk > state.monthKeys.length) {
      // All chunks generated, proceed to merge
      mergePdfChunksAndFinish(jobId);
    } else {
      // Schedule next chunk
      const trigger = ScriptApp.newTrigger('processPdfBatchTrigger')
        .timeBased()
        .after(1000) // 1 second delay
        .create();
      props.setProperty('PDF_TRIGGER_' + trigger.getUniqueId(), jobId);
    }

  } catch (error) {
    Logger.log('Error processing chunk: ' + error.message);
    updateJobStatus(jobId, 'ERROR', 0, undefined, undefined, String(error), 'Erreur');
    cleanupBatchState(jobId);
  }
}

/**
 * Merge all PDF chunks and finish the job
 */
function mergePdfChunksAndFinish(jobId) {
  const props = PropertiesService.getScriptProperties();

  try {
    updateJobStatus(jobId, 'RUNNING', 85, undefined, undefined, undefined, 'Fusion des PDFs...');

    const stateJson = props.getProperty('PDF_BATCH_STATE_' + jobId);
    const state = JSON.parse(stateJson);
    const job = getJobStatus(jobId);

    // Get all partial PDFs
    const pdfBlobs = state.partialPdfIds.map(fileId => {
      const file = DriveApp.getFileById(fileId);
      return file.getBlob();
    });

    // Merge PDFs
    const mergedPdf = mergePdfBlobsNative(pdfBlobs);

    updateJobStatus(jobId, 'RUNNING', 92, undefined, undefined, undefined, 'Sauvegarde sur Drive...');

    // Save final PDF
    const dateFrom = typeof job.date_from === 'string' ? job.date_from : Utilities.formatDate(job.date_from, 'Europe/Paris', 'yyyy-MM-dd');
    const dateTo = typeof job.date_to === 'string' ? job.date_to : Utilities.formatDate(job.date_to, 'Europe/Paris', 'yyyy-MM-dd');
    const fileName = `Livre_${job.year}_${dateFrom}-${dateTo}_gen-${formatTimestamp()}_v01.pdf`;

    const pdfData = savePdfToFolder(mergedPdf, job.year, fileName);

    // Update job status
    updateJobStatus(jobId, 'DONE', 100, pdfData.fileId, pdfData.url, undefined, 'Terminé !');

    // Send email notification
    sendPdfReadyEmail(jobId, pdfData.url);

    // Cleanup
    cleanupBatchState(jobId);

  } catch (error) {
    Logger.log('Error merging PDFs: ' + error.message);
    updateJobStatus(jobId, 'ERROR', 0, undefined, undefined, String(error), 'Erreur lors de la fusion');
    cleanupBatchState(jobId);
  }
}

/**
 * Native PDF merge using byte manipulation
 * Works for Google-generated PDFs which have a consistent structure
 *
 * FIXED VERSION:
 * - Properly updates /Parent references in Page objects
 * - Preserves binary streams by working with raw bytes
 * - More efficient object parsing
 */
function mergePdfBlobsNative(pdfBlobs) {
  if (pdfBlobs.length === 0) {
    throw new Error('No PDFs to merge');
  }

  if (pdfBlobs.length === 1) {
    return pdfBlobs[0];
  }

  Logger.log('Starting PDF merge with ' + pdfBlobs.length + ' files');

  // Parse all PDFs
  const pdfs = [];
  for (let i = 0; i < pdfBlobs.length; i++) {
    Logger.log('Parsing PDF ' + (i + 1) + '/' + pdfBlobs.length);
    pdfs.push(parsePdfStructure(pdfBlobs[i], i));
  }

  Logger.log('Building merged PDF...');
  // Merge into single PDF
  const mergedBytes = buildMergedPdf(pdfs);

  Logger.log('Merge complete, size: ' + mergedBytes.length + ' bytes');
  return Utilities.newBlob(mergedBytes, MimeType.PDF, 'merged.pdf');
}

/**
 * Parse PDF structure to extract objects and pages
 * Uses a more efficient parsing approach
 */
function parsePdfStructure(blob, pdfIndex) {
  const bytes = blob.getBytes();

  // Convert to string for parsing structure (ISO-8859-1 preserves byte values)
  const content = Utilities.newBlob(bytes).getDataAsString('ISO-8859-1');

  // Find all objects using a simpler, more efficient approach
  const objects = {};
  let maxObjNum = 0;

  // Match object headers: "N 0 obj"
  const objHeaderRegex = /(\d+)\s+0\s+obj/g;
  let headerMatch;
  const objStarts = [];

  while ((headerMatch = objHeaderRegex.exec(content)) !== null) {
    objStarts.push({
      objNum: parseInt(headerMatch[1]),
      start: headerMatch.index,
      headerEnd: headerMatch.index + headerMatch[0].length
    });
  }

  // Find endobj for each object
  for (let i = 0; i < objStarts.length; i++) {
    const objInfo = objStarts[i];
    const searchStart = objInfo.headerEnd;
    const searchEnd = i < objStarts.length - 1 ? objStarts[i + 1].start : content.length;

    // Find endobj within this object's range
    const objContent = content.substring(searchStart, searchEnd);
    const endObjPos = objContent.indexOf('endobj');

    if (endObjPos !== -1) {
      const body = objContent.substring(0, endObjPos);
      maxObjNum = Math.max(maxObjNum, objInfo.objNum);

      objects[objInfo.objNum] = {
        num: objInfo.objNum,
        body: body,
        fullContent: content.substring(objInfo.start, searchStart + endObjPos + 6)
      };
    }
  }

  // Find page objects
  const pages = [];
  for (const objNum in objects) {
    const obj = objects[objNum];
    // Check if this is a Page object (not Pages)
    if (obj.body.includes('/Type') &&
        obj.body.includes('/Page') &&
        !obj.body.includes('/Pages')) {
      pages.push(parseInt(objNum));
    }
  }

  Logger.log('PDF ' + pdfIndex + ': ' + Object.keys(objects).length + ' objects, ' + pages.length + ' pages');

  return {
    index: pdfIndex,
    bytes: bytes,
    content: content,
    objects: objects,
    pages: pages,
    maxObjNum: maxObjNum
  };
}

/**
 * Build merged PDF from parsed PDFs
 * Key fix: Updates /Parent references to point to new Pages object
 */
function buildMergedPdf(pdfs) {
  const outputChunks = [];

  // Helper to add string to output
  function addString(str) {
    for (let i = 0; i < str.length; i++) {
      outputChunks.push(str.charCodeAt(i) & 0xFF);
    }
  }

  // Write PDF header
  addString('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  // First pass: build object mapping
  let nextObjNum = 1;
  const objMapping = []; // Maps [pdfIndex][oldObjNum] to newObjNum

  for (const pdf of pdfs) {
    objMapping[pdf.index] = {};
    for (const oldObjNum in pdf.objects) {
      objMapping[pdf.index][oldObjNum] = nextObjNum++;
    }
  }

  // Reserve object numbers for new Pages and Catalog
  const pagesObjNum = nextObjNum++;
  const catalogObjNum = nextObjNum++;

  // Collect all page references (in order)
  const allPageRefs = [];
  for (const pdf of pdfs) {
    for (const oldPageNum of pdf.pages) {
      const newPageNum = objMapping[pdf.index][oldPageNum];
      if (newPageNum) {
        allPageRefs.push(newPageNum);
      }
    }
  }

  // Second pass: write all objects with updated references
  const xrefEntries = [];
  xrefEntries[0] = { offset: 0, gen: 65535, free: true };

  for (const pdf of pdfs) {
    for (const oldObjNum in pdf.objects) {
      const obj = pdf.objects[oldObjNum];
      const newObjNum = objMapping[pdf.index][oldObjNum];

      // Update references in object body
      let body = obj.body;

      // Replace all object references (N 0 R) with remapped numbers
      body = body.replace(/(\d+)\s+0\s+R/g, (match, refNum) => {
        const newRef = objMapping[pdf.index][refNum];
        return newRef ? `${newRef} 0 R` : match;
      });

      // CRITICAL FIX: Update /Parent reference in Page objects to point to new Pages object
      const isPage = allPageRefs.includes(newObjNum);
      if (isPage) {
        // Replace /Parent N 0 R with /Parent pagesObjNum 0 R
        body = body.replace(/\/Parent\s+\d+\s+0\s+R/g, `/Parent ${pagesObjNum} 0 R`);
      }

      // Record xref entry
      xrefEntries[newObjNum] = { offset: outputChunks.length, gen: 0, free: false };

      // Write object
      addString(`${newObjNum} 0 obj`);
      addString(body);
      addString('endobj\n');
    }
  }

  // Write new Pages object
  xrefEntries[pagesObjNum] = { offset: outputChunks.length, gen: 0, free: false };
  const pageRefsStr = allPageRefs.map(n => `${n} 0 R`).join(' ');
  addString(`${pagesObjNum} 0 obj\n<< /Type /Pages /Kids [${pageRefsStr}] /Count ${allPageRefs.length} >>\nendobj\n`);

  // Write new Catalog object
  xrefEntries[catalogObjNum] = { offset: outputChunks.length, gen: 0, free: false };
  addString(`${catalogObjNum} 0 obj\n<< /Type /Catalog /Pages ${pagesObjNum} 0 R >>\nendobj\n`);

  // Write xref table
  const xrefOffset = outputChunks.length;
  addString(`xref\n0 ${xrefEntries.length}\n`);

  for (let i = 0; i < xrefEntries.length; i++) {
    const entry = xrefEntries[i] || { offset: 0, gen: 65535, free: true };
    const offsetStr = String(entry.offset).padStart(10, '0');
    const genStr = String(entry.gen).padStart(5, '0');
    const flag = entry.free ? 'f' : 'n';
    addString(`${offsetStr} ${genStr} ${flag} \n`);
  }

  // Write trailer
  addString(`trailer\n<< /Size ${xrefEntries.length} /Root ${catalogObjNum} 0 R >>\n`);
  addString(`startxref\n${xrefOffset}\n%%EOF`);

  return outputChunks;
}

/**
 * Send email notification when PDF is ready
 */
function sendPdfReadyEmail(jobId, pdfUrl) {
  try {
    const job = getJobStatus(jobId);
    if (!job || !job.created_by) return;

    const familyName = getConfigValue('family_name') || 'votre famille';

    MailApp.sendEmail({
      to: job.created_by,
      subject: `📚 Votre livre de souvenirs est prêt !`,
      htmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Votre livre de souvenirs est prêt !</h2>
          <p>Bonjour,</p>
          <p>La génération de votre livre de souvenirs des <strong>${familyName}</strong> est terminée.</p>
          <p>Période : du <strong>${job.date_from}</strong> au <strong>${job.date_to}</strong></p>
          <p style="margin: 20px 0;">
            <a href="${pdfUrl}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
              📥 Télécharger le PDF
            </a>
          </p>
          <p style="color: #666; font-size: 12px;">
            Ce lien vous donne accès au fichier sur Google Drive.
          </p>
        </div>
      `
    });
  } catch (e) {
    Logger.log('Failed to send email: ' + e.message);
  }
}

/**
 * Cleanup batch state and temp files
 */
function cleanupBatchState(jobId) {
  const props = PropertiesService.getScriptProperties();

  try {
    const stateJson = props.getProperty('PDF_BATCH_STATE_' + jobId);
    if (stateJson) {
      const state = JSON.parse(stateJson);

      // Delete temp folder and its contents
      if (state.tempFolderId) {
        try {
          const tempFolder = DriveApp.getFolderById(state.tempFolderId);
          tempFolder.setTrashed(true);
        } catch (e) {
          // Folder might not exist
        }
      }
    }
  } catch (e) {
    // Ignore cleanup errors
  }

  // Remove job from queue if still there
  try {
    const queue = JSON.parse(props.getProperty('PDF_JOB_QUEUE') || '[]');
    const filteredQueue = queue.filter(id => id !== jobId);
    props.setProperty('PDF_JOB_QUEUE', JSON.stringify(filteredQueue));
  } catch (e) {
    // Ignore queue cleanup errors
  }

  // Delete properties
  props.deleteProperty('PDF_BATCH_STATE_' + jobId);
  props.deleteProperty('PDF_OPTIONS_' + jobId);
}

// Legacy function for backward compatibility (simple generation without batch)
function processOnePdfJob(jobId) {
  // Use batch processing instead
  initializeBatchState(jobId);
  processNextPdfChunk(jobId);
}

/**
 * Group articles by month-year key
 */
function groupArticlesByMonth(articles) {
  const articlesByMonth = {};
  articles.forEach((article) => {
    const date = new Date(article.date);
    const key = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`;
    if (!articlesByMonth[key]) {
      articlesByMonth[key] = [];
    }
    articlesByMonth[key].push(article);
  });
  return articlesByMonth;
}

/**
 * Generate HTML for cover page only
 */
function generateCoverOnlyHtml(articles, from, to, maxMosaicPhotos) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
${getPdfStyles()}
  </style>
</head>
<body>
  ${generateCoverMosaic(articles, from, to, maxMosaicPhotos)}
</body>
</html>
`;
}

/**
 * Generate HTML for a single month (divider + articles)
 */
function generateMonthOnlyHtml(monthArticles, monthName, year, monthIndex, startPage, totalPages, options = {}) {
  const { mosaicLayout = 'full', showSeasonalFruits = true } = options;

  let currentPage = startPage;
  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
${getPdfStyles()}
  </style>
</head>
<body>
`;

  // Month divider page (no page-break-before for first element)
  currentPage++;
  const dividerHtml = generateMonthDivider(monthArticles, monthName, year, monthIndex, currentPage, totalPages, { mosaicLayout, showSeasonalFruits });
  // Remove page-break-before from first element
  html += dividerHtml.replace('page-break-before: always;', '').replace('class="month-divider"', 'class="month-divider" style="page-break-before: auto;"');

  // Process articles 2 by 2
  for (let i = 0; i < monthArticles.length; i += 2) {
    currentPage++;
    html += `  <div class="articles-page">\n`;

    // First article
    html += renderArticle(monthArticles[i]);

    // Second article (if exists)
    if (i + 1 < monthArticles.length) {
      html += renderArticle(monthArticles[i + 1]);
    }

    html += `    <div class="page-number">${currentPage} / ${totalPages}</div>\n`;
    html += `  </div>\n`;
  }

  html += `
</body>
</html>
`;

  return html;
}

/**
 * Get common PDF styles
 */
function getPdfStyles() {
  return `
    @page {
      size: A4;
      margin: 1cm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 0;
    }

    .cover {
      page-break-after: always;
      text-align: center;
      padding-top: 8cm;
    }

    .cover h1 {
      font-size: 36pt;
      margin-bottom: 1cm;
    }

    .cover .dates {
      font-size: 18pt;
      color: #666;
    }

    /* Mosaic cover page */
    .cover-mosaic {
      height: 27.7cm;
      display: flex;
      flex-direction: column;
    }

    .cover-title {
      text-align: center;
      padding: 0.5cm 0 0.8cm 0;
      flex-shrink: 0;
    }

    .cover-title h1 {
      font-size: 26pt;
      margin: 0 0 0.4cm 0;
      color: #333;
      font-weight: bold;
    }

    .cover-title .dates {
      font-size: 13pt;
      color: #555;
      margin: 0;
    }

    .mosaic-container {
      flex: 1;
      position: relative;
      overflow: hidden;
    }

    .mosaic-cell {
      position: absolute;
      overflow: hidden;
    }

    .mosaic-cell img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .articles-page {
      page-break-before: always;
      height: 27.7cm;
      display: flex;
      flex-direction: column;
      gap: 0.4cm;
    }

    .article {
      flex: 1;
      border: 1px solid #ccc;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      max-height: 13.5cm;
    }

    .article:nth-child(2) {
      margin-top: 0.2cm;
    }

    .article-content {
      flex: 1;
      display: flex;
      overflow: hidden;
    }

    .article-content.landscape {
      flex-direction: column;
      align-items: stretch;
    }

    .article-content.landscape .article-image {
      width: 100%;
      display: flex;
      justify-content: center;
    }

    .article-content.landscape .article-image img {
      width: 100%;
      max-height: 9.5cm;
      object-fit: contain;
      object-position: center top;
    }

    .article-content.landscape .article-bottom {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 0.5cm;
      padding: 0.3cm;
    }

    .article-content.landscape .article-date {
      flex-shrink: 0;
    }

    .article-content.landscape .article-text {
      flex: 1;
    }

    .article-content.portrait {
      flex-direction: row;
      align-items: stretch;
    }

    .article-content.portrait .article-image {
      flex-shrink: 0;
      display: flex;
      align-items: stretch;
      margin-right: 0.4cm;
    }

    .article-content.portrait .article-image img {
      height: 100%;
      max-width: 10cm;
      object-fit: contain;
      object-position: left top;
    }

    .article-content.portrait .article-right {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      gap: 0.3cm;
      padding: 0.3cm 0.3cm 0.3cm 0;
    }

    .article-date {
      font-size: 11pt;
      color: #3366cc;
      font-weight: 500;
    }

    .article-text {
      font-size: 13pt;
      line-height: 1.4;
    }

    .page-number {
      text-align: right;
      font-size: 10pt;
      color: #666;
      padding-top: 0.3cm;
    }

    .month-divider {
      page-break-before: always;
      position: relative;
      height: 27.7cm;
      overflow: hidden;
    }

    .month-divider .page-number {
      position: absolute;
      bottom: 0;
      right: 0;
      z-index: 10;
    }

    .month-mosaic-bg {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      opacity: 0.15;
    }

    .month-mosaic-cell {
      position: absolute;
      overflow: hidden;
    }

    .month-mosaic-cell img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .month-title-container {
      position: absolute;
      top: 40%;
      left: 0;
      right: 0;
      text-align: center;
      transform: translateY(-50%);
      z-index: 5;
    }

    .month-title {
      font-size: 42pt;
      font-weight: bold;
      color: #333;
      margin: 0 0 0.5cm 0;
      text-shadow: 2px 2px 4px rgba(255,255,255,0.8);
    }

    .month-subtitle {
      font-size: 16pt;
      color: #666;
      margin: 0;
    }

    .month-divider-centered .month-title-container-centered {
      position: absolute;
      top: 8%;
      left: 0;
      right: 0;
      text-align: center;
      z-index: 5;
    }

    .season-decorations {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: 3;
    }

    .season-item {
      position: absolute;
    }

    .season-item img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .month-mosaic-centered {
      position: absolute;
      top: 32%;
      left: 50%;
      transform: translateX(-50%);
      width: 12cm;
      height: 12cm;
      border-radius: 0.15cm;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }

    .month-mosaic-centered .month-mosaic-cell {
      position: absolute;
    }

    .month-mosaic-centered .month-mosaic-cell img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
`;
}

/**
 * Merge multiple PDF blobs into one using PDFApp library
 * https://github.com/tanaikech/PDFApp
 * Returns a Promise (use with async/await)
 */
async function mergePdfBlobs(pdfBlobs) {
  if (pdfBlobs.length === 0) {
    throw new Error('No PDFs to merge');
  }

  if (pdfBlobs.length === 1) {
    return pdfBlobs[0];
  }

  // Use PDFApp library to merge PDFs (async)
  const mergedBlob = await PDFApp.mergePDFs(pdfBlobs);
  mergedBlob.setName('merged.pdf');

  return mergedBlob;
}

function getArticlesInRange(from, to) {
  const sheet = getArticlesSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // Find the index of the 'date' column
  const dateIndex = headers.indexOf('date');
  if (dateIndex === -1) {
    throw new Error('Column "date" not found in Articles sheet');
  }

  const articles = [];
  const fromDate = new Date(from).getTime();
  // Add 1 day to 'to' date to include the entire end day
  const toDate = new Date(to).getTime() + (24 * 60 * 60 * 1000);

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const article = {};
    headers.forEach((header, index) => {
      article[header] = row[index];
    });

    // Skip deleted articles
    if (article.status === 'DELETED') {
      continue;
    }

    // Parse the article date
    const articleDate = new Date(article.date).getTime();

    if (articleDate >= fromDate && articleDate <= toDate) {
      articles.push(article);
    }
  }

  // Sort by date
  articles.sort((a, b) => {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  return articles;
}

function generatePdfHtml(articles, year, from, to, options = {}) {
  const { mosaicLayout = 'full', showSeasonalFruits = true, maxMosaicPhotos } = options;

  const monthsFr = [
    'Janvier',
    'Février',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Août',
    'Septembre',
    'Octobre',
    'Novembre',
    'Décembre',
  ];

  // Group articles by month-year key
  const articlesByMonth = {};
  articles.forEach((article) => {
    const date = new Date(article.date);
    const key = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`;
    if (!articlesByMonth[key]) {
      articlesByMonth[key] = [];
    }
    articlesByMonth[key].push(article);
  });

  // Get sorted month keys (only months with articles)
  const monthKeys = Object.keys(articlesByMonth).sort();

  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: A4;
      margin: 1cm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 0;
    }

    .cover {
      page-break-after: always;
      text-align: center;
      padding-top: 8cm;
    }

    .cover h1 {
      font-size: 36pt;
      margin-bottom: 1cm;
    }

    .cover .dates {
      font-size: 18pt;
      color: #666;
    }

    /* Mosaic cover page */
    .cover-mosaic {
      page-break-after: always;
      height: 27.7cm;
      display: flex;
      flex-direction: column;
    }

    .cover-title {
      text-align: center;
      padding: 0.5cm 0 0.8cm 0;
      flex-shrink: 0;
    }

    .cover-title h1 {
      font-size: 26pt;
      margin: 0 0 0.4cm 0;
      color: #333;
      font-weight: bold;
    }

    .cover-title .dates {
      font-size: 13pt;
      color: #555;
      margin: 0;
    }

    .mosaic-container {
      flex: 1;
      position: relative;
      overflow: hidden;
    }

    .mosaic-cell {
      position: absolute;
      overflow: hidden;
    }

    .mosaic-cell img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .articles-page {
      page-break-before: always;
      height: 27.7cm; /* A4 height (29.7cm) - 2cm margins */
      display: flex;
      flex-direction: column;
      gap: 0.4cm;
    }

    .article {
      flex: 1;
      border: 1px solid #ccc;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      max-height: 13.5cm;
    }

    .article:nth-child(2) {
      margin-top: 0.2cm;
    }

    .article-content {
      flex: 1;
      display: flex;
      overflow: hidden;
    }

    /* Layout for landscape images: photo fills width, date+description below */
    .article-content.landscape {
      flex-direction: column;
      align-items: stretch;
    }

    .article-content.landscape .article-image {
      width: 100%;
      display: flex;
      justify-content: center;
    }

    .article-content.landscape .article-image img {
      width: 100%;
      max-height: 9.5cm;
      object-fit: contain;
      object-position: center top;
    }

    .article-content.landscape .article-bottom {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 0.5cm;
      padding: 0.3cm;
    }

    .article-content.landscape .article-date {
      flex-shrink: 0;
    }

    .article-content.landscape .article-text {
      flex: 1;
    }

    /* Layout for portrait images: photo fills height on left, text right */
    .article-content.portrait {
      flex-direction: row;
      align-items: stretch;
    }

    .article-content.portrait .article-image {
      flex-shrink: 0;
      display: flex;
      align-items: stretch;
      margin-right: 0.4cm;
    }

    .article-content.portrait .article-image img {
      height: 100%;
      max-width: 10cm;
      object-fit: contain;
      object-position: left top;
    }

    .article-content.portrait .article-right {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      gap: 0.3cm;
      padding: 0.3cm 0.3cm 0.3cm 0;
    }

    .article-date {
      font-size: 11pt;
      color: #3366cc;
      font-weight: 500;
    }

    .article-text {
      font-size: 13pt;
      line-height: 1.4;
    }

    .page-number {
      text-align: right;
      font-size: 10pt;
      color: #666;
      padding-top: 0.3cm;
    }

    .month-divider {
      page-break-before: always;
      position: relative;
      height: 27.7cm;
      overflow: hidden;
    }

    .month-divider .page-number {
      position: absolute;
      bottom: 0;
      right: 0;
      z-index: 10;
    }

    /* Month mosaic background */
    .month-mosaic-bg {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      opacity: 0.15;
    }

    .month-mosaic-cell {
      position: absolute;
      overflow: hidden;
    }

    .month-mosaic-cell img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    /* Seasonal fruits/vegetables decoration */
    .season-decorations {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: 1;
    }

    .season-item {
      position: absolute;
      opacity: 0.85;
    }

    .season-item img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    /* Month title overlay */
    .month-title-container {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      z-index: 5;
    }

    .month-title {
      font-size: 42pt;
      font-weight: bold;
      color: #333;
      text-shadow: 2px 2px 8px rgba(255,255,255,0.9), -2px -2px 8px rgba(255,255,255,0.9), 2px -2px 8px rgba(255,255,255,0.9), -2px 2px 8px rgba(255,255,255,0.9);
      margin: 0;
      padding: 0.5cm 1.5cm;
      background: rgba(255,255,255,0.85);
      border-radius: 0.15cm;
      border: 2px solid rgba(51,51,51,0.3);
    }

    .month-subtitle {
      font-size: 14pt;
      color: #666;
      margin-top: 0.3cm;
      text-shadow: 1px 1px 4px rgba(255,255,255,0.9);
    }

    /* Centered layout mode for month divider */
    .month-divider-centered {
      background: #f5f5f5;
    }

    .month-divider-centered .month-mosaic-bg {
      display: none;
    }

    .month-title-container-centered {
      position: absolute;
      top: 12%;
      left: 50%;
      transform: translateX(-50%);
      text-align: center;
      z-index: 5;
    }

    .month-title-container-centered .month-title {
      font-size: 42pt;
      font-weight: bold;
      color: #333;
      margin: 0;
      padding: 0.5cm 1.5cm;
      background: none;
    }

    .month-title-container-centered .month-subtitle {
      font-size: 14pt;
      color: #666;
      margin-top: 0.3cm;
    }

    .month-mosaic-centered {
      position: absolute;
      top: 32%;
      left: 50%;
      transform: translateX(-50%);
      width: 12cm;
      height: 12cm;
      border-radius: 0.15cm;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }

    .month-mosaic-centered .month-mosaic-cell {
      position: absolute;
    }

    .month-mosaic-centered .month-mosaic-cell img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  </style>
</head>
<body>
  <!-- Cover Page with Mosaic -->
  ${generateCoverMosaic(articles, from, to, maxMosaicPhotos)}
`;

  // Calculate total pages: 1 cover + (month dividers + article pages)
  let totalPages = 1; // cover page
  for (const monthKey of monthKeys) {
    totalPages += 1; // month divider
    const monthArticles = articlesByMonth[monthKey];
    totalPages += Math.ceil(monthArticles.length / 2); // article pages (2 articles per page)
  }

  // Add month dividers and articles
  let currentPage = 1; // Start counting from page 2 (after cover)
  for (const monthKey of monthKeys) {
    const [yearStr, monthStr] = monthKey.split('-');
    const monthIndex = parseInt(monthStr);
    const monthName = monthsFr[monthIndex];
    const monthYear = `${monthName} ${yearStr}`;

    // Get articles for this month
    const monthArticles = articlesByMonth[monthKey];

    // Month divider page
    currentPage++;
    html += generateMonthDivider(monthArticles, monthName, yearStr, monthIndex, currentPage, totalPages, { mosaicLayout, showSeasonalFruits });

    // Process articles 2 by 2
    for (let i = 0; i < monthArticles.length; i += 2) {
      currentPage++;
      html += `  <div class="articles-page">\n`;

      // First article
      const article1 = monthArticles[i];
      html += renderArticle(article1);

      // Second article (if exists)
      if (i + 1 < monthArticles.length) {
        const article2 = monthArticles[i + 1];
        html += renderArticle(article2);
      }

      html += `    <div class="page-number">${currentPage} / ${totalPages}</div>\n`;
      html += `  </div>\n`;
    }
  }

  html += `
</body>
</html>
`;

  return html;
}

function renderArticle(article) {
  const dateStr = formatDateTimeFr(article.date);

  // Get image as base64 and detect orientation
  let imageHtml = '';
  let isPortrait = false;

  if (article.image_file_id) {
    try {
      const file = DriveApp.getFileById(article.image_file_id);
      const blob = file.getBlob();
      const base64 = Utilities.base64Encode(blob.getBytes());
      const mimeType = blob.getContentType();

      // Try to get image dimensions to detect portrait orientation
      const imageBytes = blob.getBytes();
      const dimensions = getImageDimensions(imageBytes, mimeType);
      if (dimensions && dimensions.height > dimensions.width) {
        isPortrait = true;
      }

      imageHtml = `<img src="data:${mimeType};base64,${base64}" alt="" />`;
    } catch (e) {
      // If image fails to load, skip it
      imageHtml = '';
    }
  }

  const textHtml = article.texte ? escapeHtml(article.texte) : '';

  if (isPortrait) {
    // Portrait: image left, date + description right (date above description)
    return `
    <div class="article">
      <div class="article-content portrait">
        <div class="article-image">${imageHtml}</div>
        <div class="article-right">
          <div class="article-date">${dateStr}</div>
          ${textHtml ? `<div class="article-text">${textHtml}</div>` : ''}
        </div>
      </div>
    </div>
`;
  } else {
    // Landscape: image top, date + description below (date left of description)
    return `
    <div class="article">
      <div class="article-content landscape">
        <div class="article-image">${imageHtml}</div>
        <div class="article-bottom">
          <div class="article-date">${dateStr}</div>
          ${textHtml ? `<div class="article-text">${textHtml}</div>` : ''}
        </div>
      </div>
    </div>
`;
  }
}

function getImageDimensions(bytes, mimeType) {
  try {
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
      return getJpegDimensions(bytes);
    } else if (mimeType === 'image/png') {
      return getPngDimensions(bytes);
    }
  } catch (e) {
    // If we can't detect, return null
  }
  return null;
}

function getJpegDimensions(bytes) {
  // JPEG dimensions are in SOF0 marker (0xFF 0xC0)
  for (let i = 0; i < bytes.length - 9; i++) {
    if (bytes[i] === -1 && (bytes[i + 1] === -64 || bytes[i + 1] === -62)) { // 0xFF 0xC0 or 0xFF 0xC2
      const height = (bytes[i + 5] << 8) | (bytes[i + 6] & 0xFF);
      const width = (bytes[i + 7] << 8) | (bytes[i + 8] & 0xFF);
      return { width: width, height: height };
    }
  }
  return null;
}

function getPngDimensions(bytes) {
  // PNG dimensions are at bytes 16-23 in the IHDR chunk
  if (bytes.length > 24) {
    const width = ((bytes[16] & 0xFF) << 24) | ((bytes[17] & 0xFF) << 16) | ((bytes[18] & 0xFF) << 8) | (bytes[19] & 0xFF);
    const height = ((bytes[20] & 0xFF) << 24) | ((bytes[21] & 0xFF) << 16) | ((bytes[22] & 0xFF) << 8) | (bytes[23] & 0xFF);
    return { width: width, height: height };
  }
  return null;
}

/**
 * Generate a mosaic cover page with all article images
 * Uses a smart bin-packing algorithm that:
 * - Uses all images exactly once (up to maxPhotos limit)
 * - Shows full images without cropping
 * - Uses 2px gap between images
 * - Creates harmonious rows with variable heights
 */
function generateCoverMosaic(articles, from, to, maxPhotos) {
  // Get family name from config
  const familyName = getConfigValue('family_name');
  const titleText = familyName
    ? `Livre de souvenir des ${escapeHtml(familyName)}`
    : 'Livre de Souvenirs';

  // Collect all images with their dimensions
  const images = [];
  const photoLimit = maxPhotos || articles.length;

  for (const article of articles) {
    if (article.image_file_id && images.length < photoLimit) {
      try {
        const file = DriveApp.getFileById(article.image_file_id);
        const blob = file.getBlob();
        const base64 = Utilities.base64Encode(blob.getBytes());
        const mimeType = blob.getContentType();
        const imageBytes = blob.getBytes();
        const dimensions = getImageDimensions(imageBytes, mimeType);

        // Default to 4:3 if dimensions unknown
        const aspectRatio = dimensions ? dimensions.width / dimensions.height : 4/3;

        images.push({
          base64,
          mimeType,
          aspectRatio: aspectRatio
        });
      } catch (e) {
        // Skip failed images
      }
    }
  }

  // Format dates as "Du ... au ..."
  const datesText = `Du ${formatDateFr(from)} au ${formatDateFr(to)}`;

  if (images.length === 0) {
    return `
  <div class="cover">
    <h1>${titleText}</h1>
    <p class="dates">${datesText}</p>
  </div>
`;
  }

  // Available space
  const mosaicWidth = 19;  // cm
  const mosaicHeight = 22; // cm
  const gap = 0.07;        // ~2px gap in cm

  // Generate smart layout
  const cells = generateSmartMosaicLayout(images, mosaicWidth, mosaicHeight, gap);

  // Generate HTML for cells
  let mosaicHtml = '';
  for (const cell of cells) {
    mosaicHtml += `
        <div class="mosaic-cell" style="left: ${cell.x.toFixed(3)}cm; top: ${cell.y.toFixed(3)}cm; width: ${cell.w.toFixed(3)}cm; height: ${cell.h.toFixed(3)}cm;">
          <img src="data:${cell.img.mimeType};base64,${cell.img.base64}" alt="" />
        </div>`;
  }

  return `
  <div class="cover-mosaic">
    <div class="cover-title">
      <h1>${titleText}</h1>
      <p class="dates">${datesText}</p>
    </div>
    <div class="mosaic-container">
      ${mosaicHtml}
    </div>
  </div>
`;
}

/**
 * Smart mosaic layout algorithm using justified rows
 * Each row is scaled to fit the container width exactly
 * Row heights vary based on the images they contain
 */
function generateSmartMosaicLayout(images, totalWidth, totalHeight, gap) {
  const n = images.length;
  if (n === 0) return [];

  // Special case for single image
  if (n === 1) {
    const img = images[0];
    // Center the image while maintaining aspect ratio
    let w, h;
    if (img.aspectRatio > totalWidth / totalHeight) {
      w = totalWidth;
      h = w / img.aspectRatio;
    } else {
      h = totalHeight;
      w = h * img.aspectRatio;
    }
    return [{ img, x: (totalWidth - w) / 2, y: (totalHeight - h) / 2, w, h }];
  }

  // Calculate optimal row count based on image count
  const containerAspect = totalWidth / totalHeight;

  // Estimate ideal number of rows
  // Formula based on: total_aspect_sum / container_aspect ≈ rows²
  const totalAspectSum = images.reduce((sum, img) => sum + img.aspectRatio, 0);
  let numRows = Math.round(Math.sqrt(totalAspectSum / containerAspect));
  numRows = Math.max(1, Math.min(numRows, Math.ceil(n / 2))); // At least 2 images per row

  // Distribute images into rows using a greedy algorithm
  // Try to balance the aspect ratio sum across rows
  const targetAspectPerRow = totalAspectSum / numRows;
  const rows = [];
  let currentRow = [];
  let currentRowAspect = 0;

  for (const img of images) {
    if (currentRow.length > 0 &&
        currentRowAspect >= targetAspectPerRow * 0.8 &&
        rows.length < numRows - 1) {
      // Start new row if current has enough content
      rows.push(currentRow);
      currentRow = [img];
      currentRowAspect = img.aspectRatio;
    } else {
      currentRow.push(img);
      currentRowAspect += img.aspectRatio;
    }
  }
  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  // Calculate row heights
  // Each row's height is proportional to 1 / (sum of aspect ratios in that row)
  // This ensures all images in a row have the same height when justified
  const rowWeights = rows.map(row => {
    const aspectSum = row.reduce((sum, img) => sum + img.aspectRatio, 0);
    return 1 / aspectSum;
  });
  const totalWeight = rowWeights.reduce((sum, w) => sum + w, 0);
  const availableHeight = totalHeight - (rows.length - 1) * gap;

  // Generate cells
  const cells = [];
  let currentY = 0;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const rowHeight = (rowWeights[r] / totalWeight) * availableHeight;
    const rowAspectSum = row.reduce((sum, img) => sum + img.aspectRatio, 0);
    const availableRowWidth = totalWidth - (row.length - 1) * gap;

    let currentX = 0;
    for (let i = 0; i < row.length; i++) {
      const img = row[i];
      const cellWidth = (img.aspectRatio / rowAspectSum) * availableRowWidth;

      cells.push({
        img,
        x: currentX,
        y: currentY,
        w: cellWidth,
        h: rowHeight
      });

      currentX += cellWidth + gap;
    }

    currentY += rowHeight + gap;
  }

  return cells;
}

/**
 * Generate a month divider page with mosaic background, seasonal fruits, and title
 * Supports two layout modes: 'full' (background mosaic) and 'centered' (smaller mosaic below title)
 */
function generateMonthDivider(monthArticles, monthName, year, monthIndex, currentPage, totalPages, options = {}) {
  const { mosaicLayout = 'full', showSeasonalFruits = true } = options;
  const monthYear = `${monthName} ${year}`;
  const articleCount = monthArticles.length;

  // Generate mini mosaic from month's images
  const mosaicHtml = generateMonthMosaic(monthArticles, mosaicLayout);

  // Get seasonal fruits for this month (if enabled)
  const fruitsHtml = showSeasonalFruits ? generateSeasonalFruits(monthIndex) : '';

  if (mosaicLayout === 'centered') {
    // Centered mode: title at top, smaller opaque mosaic below
    return `
  <div class="month-divider month-divider-centered">
    <!-- Seasonal decorations (fruits/vegetables) -->
    <div class="season-decorations">
      ${fruitsHtml}
    </div>

    <!-- Month title (raised position) -->
    <div class="month-title-container-centered">
      <h2 class="month-title">${monthYear}</h2>
      <p class="month-subtitle">${articleCount} souvenir${articleCount > 1 ? 's' : ''}</p>
    </div>

    <!-- Centered mosaic (smaller, below title) -->
    <div class="month-mosaic-centered">
      ${mosaicHtml}
    </div>

    <div class="page-number">${currentPage} / ${totalPages}</div>
  </div>
`;
  }

  // Full mode (default): background mosaic with overlay title
  return `
  <div class="month-divider">
    <!-- Background mosaic from month's photos -->
    <div class="month-mosaic-bg">
      ${mosaicHtml}
    </div>

    <!-- Seasonal decorations (fruits/vegetables) -->
    <div class="season-decorations">
      ${fruitsHtml}
    </div>

    <!-- Month title -->
    <div class="month-title-container">
      <h2 class="month-title">${monthYear}</h2>
      <p class="month-subtitle">${articleCount} souvenir${articleCount > 1 ? 's' : ''}</p>
    </div>

    <div class="page-number">${currentPage} / ${totalPages}</div>
  </div>
`;
}

/**
 * Generate a small mosaic of images for the month divider background
 * @param {string} layout - 'full' for full page background, 'centered' for smaller centered mosaic
 */
function generateMonthMosaic(monthArticles, layout = 'full') {
  // Collect images from articles
  const images = [];

  for (const article of monthArticles) {
    if (article.image_file_id && images.length < 12) { // Limit to 12 images for performance
      try {
        const file = DriveApp.getFileById(article.image_file_id);
        const blob = file.getBlob();
        const base64 = Utilities.base64Encode(blob.getBytes());
        const mimeType = blob.getContentType();
        const imageBytes = blob.getBytes();
        const dimensions = getImageDimensions(imageBytes, mimeType);

        const isPortrait = dimensions && dimensions.height > dimensions.width;
        const aspectRatio = dimensions ? dimensions.width / dimensions.height : 1;

        images.push({
          base64,
          mimeType,
          isPortrait,
          aspectRatio
        });
      } catch (e) {
        // Skip failed images
      }
    }
  }

  if (images.length === 0) {
    return '';
  }

  // Adjust dimensions based on layout
  // Full mode: entire page (19cm x 27.7cm)
  // Centered mode: smaller area (12cm x 12cm)
  const mosaicWidth = layout === 'centered' ? 12 : 19;  // cm
  const mosaicHeight = layout === 'centered' ? 12 : 27.7; // cm
  const gap = 0.1;

  // Calculate grid dimensions
  const cols = images.length <= 4 ? 2 : (images.length <= 9 ? 3 : 4);
  const rows = Math.ceil(images.length / cols);

  const cellWidth = (mosaicWidth - (cols - 1) * gap) / cols;
  const cellHeight = (mosaicHeight - (rows - 1) * gap) / rows;

  let html = '';
  let imgIndex = 0;

  for (let r = 0; r < rows && imgIndex < images.length; r++) {
    for (let c = 0; c < cols && imgIndex < images.length; c++) {
      const img = images[imgIndex];
      const x = c * (cellWidth + gap);
      const y = r * (cellHeight + gap);

      html += `
        <div class="month-mosaic-cell" style="left: ${x.toFixed(2)}cm; top: ${y.toFixed(2)}cm; width: ${cellWidth.toFixed(2)}cm; height: ${cellHeight.toFixed(2)}cm;">
          <img src="data:${img.mimeType};base64,${img.base64}" alt="" />
        </div>`;
      imgIndex++;
    }
  }

  return html;
}

/**
 * Generate seasonal fruits/vegetables images positioned around the page edges
 * Uses ALL images from SEASONAL_IMAGES for the month
 * Positions are calculated to avoid overlap and pagination area
 */
function generateSeasonalFruits(monthIndex) {
  // Month index is 0-based, SEASONAL_IMAGES uses 1-based keys
  const monthKey = monthIndex + 1;
  const images = SEASONAL_IMAGES[monthKey] || [];

  if (images.length === 0) {
    return '';
  }

  // Page dimensions (after margins)
  const pageWidth = 19;   // cm
  const pageHeight = 27.7; // cm

  // Calculate image size based on count - smaller if more images
  // Target: fit all images around edges without overlap
  const perimeter = 2 * (pageWidth + pageHeight - 4); // -4 for pagination reserve
  const idealSize = Math.min(2.2, perimeter / images.length * 0.8);
  const imgSize = Math.max(1.4, idealSize); // Minimum 1.4cm

  // Define edge segments for placement (avoiding center and pagination)
  const positions = [];
  const paginationReserve = 4; // cm reserved for pagination in bottom-right

  // Calculate how many images per edge proportionally
  const topLength = pageWidth;
  const rightLength = pageHeight - 5; // Leave top and bottom margins
  const bottomLength = pageWidth - paginationReserve;
  const leftLength = pageHeight - 5;
  const totalLength = topLength + rightLength + bottomLength + leftLength;

  const topCount = Math.round(images.length * topLength / totalLength);
  const rightCount = Math.round(images.length * rightLength / totalLength);
  const bottomCount = Math.round(images.length * bottomLength / totalLength);
  const leftCount = images.length - topCount - rightCount - bottomCount;

  // Top edge - evenly spaced
  for (let i = 0; i < topCount; i++) {
    const spacing = topCount > 1 ? (pageWidth - imgSize) / (topCount - 1) : (pageWidth - imgSize) / 2;
    positions.push({
      x: topCount > 1 ? i * spacing : spacing,
      y: 0.1,
      size: imgSize
    });
  }

  // Right edge - evenly spaced, stopping before pagination area
  for (let i = 0; i < rightCount; i++) {
    const startY = 2.5;
    const endY = pageHeight - paginationReserve - 1;
    const spacing = rightCount > 1 ? (endY - startY - imgSize) / (rightCount - 1) : 0;
    positions.push({
      x: pageWidth - imgSize - 0.1,
      y: startY + (rightCount > 1 ? i * spacing : (endY - startY - imgSize) / 2),
      size: imgSize
    });
  }

  // Bottom edge - evenly spaced, avoiding pagination area
  for (let i = 0; i < bottomCount; i++) {
    const availableWidth = pageWidth - paginationReserve - imgSize;
    const spacing = bottomCount > 1 ? availableWidth / (bottomCount - 1) : availableWidth / 2;
    positions.push({
      x: bottomCount > 1 ? i * spacing : spacing,
      y: pageHeight - imgSize - 0.1,
      size: imgSize
    });
  }

  // Left edge - evenly spaced
  for (let i = 0; i < leftCount; i++) {
    const startY = 2.5;
    const endY = pageHeight - 3;
    const spacing = leftCount > 1 ? (endY - startY - imgSize) / (leftCount - 1) : 0;
    positions.push({
      x: 0.1,
      y: startY + (leftCount > 1 ? i * spacing : (endY - startY - imgSize) / 2),
      size: imgSize
    });
  }

  // Shuffle images to randomize which image goes where
  const shuffled = [...images].sort(() => Math.random() - 0.5);

  let html = '';

  for (let i = 0; i < Math.min(positions.length, shuffled.length); i++) {
    const pos = positions[i];
    const img = shuffled[i];

    // Add slight rotation for visual interest (-12 to +12 degrees)
    const rotation = Math.floor(Math.random() * 24) - 12;

    html += `<div class="season-item" style="left: ${pos.x.toFixed(2)}cm; top: ${pos.y.toFixed(2)}cm; width: ${pos.size.toFixed(2)}cm; height: ${pos.size.toFixed(2)}cm; transform: rotate(${rotation}deg);">
      <img src="${img.data}" alt="${img.name}" />
    </div>`;
  }

  return html;
}

function formatDateFr(dateInput) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const monthsFr = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  return `${date.getDate()} ${monthsFr[date.getMonth()]} ${date.getFullYear()}`;
}

function formatDateTimeFr(dateInput) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const monthsFr = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const day = String(date.getDate()).padStart(2, '0');
  const month = monthsFr[date.getMonth()];
  const year = date.getFullYear();
  return `Le ${day} ${month} ${year}`;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function convertHtmlToPdf(html) {
  const htmlBlob = Utilities.newBlob(html, 'text/html', 'document.html');
  const pdfBlob = htmlBlob.getAs('application/pdf');
  return pdfBlob;
}
