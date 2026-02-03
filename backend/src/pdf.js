// PDF Generation - Batch Architecture with Triggers
// Generates PDFs in chunks using time-driven triggers to avoid timeouts

function installPdfWorker() {
  // Nettoyage des triggers existants du worker (optionnel)
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction && t.getHandlerFunction() === 'pdfWorkerTick') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Un trigger permanent
  ScriptApp.newTrigger('pdfWorkerTick')
    .timeBased()
    .everyMinutes(1)   // ajuster si besoin
    .create();
}

function enqueuePdfJob(jobId) {
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  const gotLock = lock.tryLock(1000);
  if (!gotLock) {
    Logger.log('Queue lock busy, skipping enqueue for job: ' + jobId);
    return;
  }

  try {
    const key = 'PDF_JOB_QUEUE';
    const queue = JSON.parse(props.getProperty(key) || '[]');
    if (!queue.includes(jobId)) queue.push(jobId);
    props.setProperty(key, JSON.stringify(queue));
  } finally {
    lock.releaseLock();
  }
}

function isJobQueued(jobId) {
  const props = PropertiesService.getScriptProperties();
  const queue = JSON.parse(props.getProperty('PDF_JOB_QUEUE') || '[]');
  return queue.includes(jobId);
}

async function pdfWorkerTick() {
  const jobId = dequeuePdfJob();
  if (!jobId) return;

  try {
    logPdfEvent(jobId, 'INFO', 'Worker tick start');
    await processNextPdfChunk(jobId);

    // Si le job n’est pas fini, on le remet dans la queue
    const props = PropertiesService.getScriptProperties();
    const stateJson = props.getProperty('PDF_BATCH_STATE_' + jobId);

    if (stateJson) {
      const state = JSON.parse(stateJson);
      const job = getJobStatus(jobId);

      const done = job && (job.status === 'DONE' || job.status === 'ERROR' || job.status === 'CANCELLED');
      const finishedChunks = state.currentChunk > state.monthKeys.length;

      if (!done && !finishedChunks) {
        enqueuePdfJob(jobId);
      }
    }
  } catch (e) {
    Logger.log('Worker error: ' + e.message);
    logPdfEvent(jobId, 'ERROR', 'Worker error', { message: String(e), stack: e && e.stack ? String(e.stack) : '' });
    updateJobStatus(jobId, 'ERROR', 0, undefined, undefined, String(e), 'Error');
    cleanupBatchState(jobId);
  }
}


function dequeuePdfJob() {
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  const gotLock = lock.tryLock(1000);
  if (!gotLock) {
    Logger.log('Queue lock busy, skipping dequeue');
    return null;
  }

  try {
    const key = 'PDF_JOB_QUEUE';
    const queue = JSON.parse(props.getProperty(key) || '[]');
    const jobId = queue.shift();
    props.setProperty(key, JSON.stringify(queue));
    return jobId || null;
  } finally {
    lock.releaseLock();
  }
}


function handlePdfCreate(body, user) {
  const jobId = createJob(body.from, body.to, user.email);

  // Store options in script properties for async processing
  const props = PropertiesService.getScriptProperties();
  props.setProperty('PDF_OPTIONS_' + jobId, JSON.stringify({
    mosaicLayout: body.options?.mosaic_layout || 'full',
    showSeasonalFruits: body.options?.show_seasonal_fruits !== false,
    maxMosaicPhotos: body.options?.max_mosaic_photos || undefined,
    autoMerge: body.options?.auto_merge === true,
    cleanChunks: body.options?.clean_chunks === true
  }));

  // Return immediately with PENDING status
  // Frontend will call pdf/process to trigger the actual generation
  return createResponse({
    ok: true,
    data: {
      job_id: jobId,
      status: 'PENDING',
      progress: 0,
      progress_message: 'Pending...',
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

  const job = getJobStatus(jobId);
  if (!job) {
    return createResponse({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Job not found' },
    });
  }

  if (job.status === 'DONE' || job.status === 'ERROR' || job.status === 'CANCELLED') {
    return createResponse({
      ok: false,
      error: { code: 'INVALID_STATUS', message: 'Job cannot be processed' },
    });
  }

  // Initialise l’état si pas encore fait
  const props = PropertiesService.getScriptProperties();
  const existingState = props.getProperty('PDF_BATCH_STATE_' + jobId);
  if (!existingState) {
    initializeBatchState(jobId);
  }

  // Ajoute dans la queue (le worker fera le reste)
  if (!isJobQueued(jobId)) {
    enqueuePdfJob(jobId);
  }

  return createResponse({
    ok: true,
    data: { queued: true, job_id: jobId },
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

  // Clean up batch state and temp files
  cleanupBatchState(jobId);

  // Remove job from sheet after cancellation
  try {
    deletePdfJob(jobId);
  } catch (e) {
    Logger.log('Failed to delete cancelled job row: ' + e.message);
  }

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

  updateJobStatus(jobId, 'RUNNING', 5, undefined, undefined, undefined, 'Initializing...');

  const job = getJobStatus(jobId);
  if (!job) {
    throw new Error('Job not found');
  }

  // Get articles and group by month
  const articles = getArticlesInRange(job.date_from, job.date_to);
  const articlesByMonth = groupArticlesByMonth(articles);
  const monthKeys = Object.keys(articlesByMonth).sort();
  const articlesPerChunk = parseInt(getConfigValue('pdf_articles_per_chunk') || '', 10) || 10;

  // Calculate total pages for page numbering
  let totalPages = 1; // cover page
  let totalSegments = 1; // cover segment
  for (const monthKey of monthKeys) {
    totalPages += 1; // month divider
    totalPages += Math.ceil(articlesByMonth[monthKey].length / 2);
    totalSegments += Math.max(1, Math.ceil(articlesByMonth[monthKey].length / articlesPerChunk));
  }

  // Create folder for PDF chunks inside Rememly/PDF
  const tempFolder = createPdfJobFolder(jobId);
  updateJobChunksFolder(jobId, tempFolder.getId(), tempFolder.getUrl());

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
    articlesCount: articles.length,
    monthOffsets: {},
    totalSegments: totalSegments,
    completedSegments: 0
  };

  props.setProperty('PDF_BATCH_STATE_' + jobId, JSON.stringify(batchState));

  updateJobStatus(jobId, 'RUNNING', 10, undefined, undefined, undefined, `${articles.length} articles found`);
}

/**
 * Process the next chunk of the PDF batch
 * NOTE:
 * - This function processes ONE chunk only
 * - It NEVER creates or deletes triggers
 * - Orchestration is handled by the permanent worker (pdfWorkerTick)
 */
async function processNextPdfChunk(jobId) {
  const props = PropertiesService.getScriptProperties();
  const gotJobLease = tryAcquireJobLease(jobId);

  if (!gotJobLease) {
    Logger.log('Job lease busy, re-queuing job: ' + jobId);
    enqueuePdfJob(jobId);
    return;
  }

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

    const monthsFr = [
      'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
    const monthsEn = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const tempFolder = DriveApp.getFolderById(state.tempFolderId);

    // =====================================================
    // CHUNK 0 : COVER PAGE
    // =====================================================
    if (state.currentChunk === 0) {
      updateJobStatus(
        jobId,
        'RUNNING',
        15,
        undefined,
        undefined,
        undefined,
        'Generating cover...'
      );

      const articles = getArticlesInRange(job.date_from, job.date_to);
      const coverHtml = generateCoverOnlyHtml(
        articles,
        job.date_from,
        job.date_to,
        pdfOptions.maxMosaicPhotos
      );
      const coverPdf = convertHtmlToPdf(coverHtml);

      const coverFile = tempFolder.createFile(coverPdf);
      coverFile.setName('chunk_000_cover.pdf');
      state.partialPdfIds.push(coverFile.getId());

      state.currentChunk = 1;
      state.currentPage = 1;
      state.completedSegments = (state.completedSegments || 0) + 1;
    }

    // =====================================================
    // CHUNKS 1..N : MONTHS
    // =====================================================
    else if (state.currentChunk <= state.monthKeys.length) {
      const monthIndex = state.currentChunk - 1;
      const monthKey = state.monthKeys[monthIndex];
      const [yearStr, monthStr] = monthKey.split('-');
      const monthIdx = parseInt(monthStr, 10) - 1;
      const monthName = monthsFr[monthIdx];
      const monthNameEn = monthsEn[monthIdx];

      const totalSegments = state.totalSegments || (state.monthKeys.length + 1);
      const completedSegments = state.completedSegments || 0;
      const progress = Math.round(
        15 + (completedSegments / totalSegments) * 65
      );

      updateJobStatus(
        jobId,
        'RUNNING',
        progress,
        undefined,
        undefined,
        undefined,
        `Generating ${monthNameEn} ${yearStr}...`
      );

      const articles = getArticlesInRange(job.date_from, job.date_to);
      const articlesByMonth = groupArticlesByMonth(articles);
      const monthArticles = articlesByMonth[monthKey] || [];
      const articlesPerChunk = parseInt(getConfigValue('pdf_articles_per_chunk') || '', 10) || 10;
      state.monthOffsets = state.monthOffsets || {};
      const offset = state.monthOffsets[monthKey] || 0;
      const chunkArticles = monthArticles.slice(offset, offset + articlesPerChunk);
      const includeDivider = offset === 0;

      const monthHtml = generateMonthChunkHtml(
        monthArticles,
        chunkArticles,
        monthName,
        yearStr,
        monthIdx,
        state.currentPage,
        state.totalPages,
        pdfOptions,
        includeDivider
      );

      const monthPdf = convertHtmlToPdf(monthHtml);
      const monthFile = tempFolder.createFile(monthPdf);
      const offsetLabel = String(offset).padStart(4, '0');
      monthFile.setName(
        `chunk_${String(state.currentChunk).padStart(3, '0')}_${monthKey}_part_${offsetLabel}.pdf`
      );

      state.partialPdfIds.push(monthFile.getId());

      const pagesThisChunk = (includeDivider ? 1 : 0) + Math.ceil(chunkArticles.length / 2);
      state.currentPage += pagesThisChunk;
      state.completedSegments = (state.completedSegments || 0) + 1;

      const nextOffset = offset + chunkArticles.length;
      if (nextOffset >= monthArticles.length) {
        delete state.monthOffsets[monthKey];
        state.currentChunk++;
      } else {
        state.monthOffsets[monthKey] = nextOffset;
      }
    }

    // =====================================================
    // SAVE STATE
    // =====================================================
    props.setProperty(
      'PDF_BATCH_STATE_' + jobId,
      JSON.stringify(state)
    );

    // =====================================================
    // FINAL STEP
    // =====================================================
    if (state.currentChunk > state.monthKeys.length) {
      // All chunks generated, finalize job without merge
      finalizePdfChunks(jobId);
    }

    // IMPORTANT:
    // No trigger scheduling here.
    // The permanent worker will re-enqueue this job if needed.

  } catch (error) {
    Logger.log('Error processing chunk: ' + error.message);
    updateJobStatus(
      jobId,
      'ERROR',
      0,
      undefined,
      undefined,
      String(error),
      'Error'
    );
    cleanupBatchState(jobId);
  } finally {
    releaseJobLease(jobId);
  }
}

function tryAcquireJobLease(jobId) {
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  const gotLock = lock.tryLock(1000);

  if (!gotLock) {
    return false;
  }

  try {
    const key = 'PDF_JOB_ACTIVE_' + jobId;
    const raw = props.getProperty(key);
    if (raw) {
      const last = parseInt(raw, 10);
      if (!isNaN(last) && (Date.now() - last) < 30 * 60 * 1000) {
        return false;
      }
    }
    props.setProperty(key, String(Date.now()));
    return true;
  } finally {
    lock.releaseLock();
  }
}

function releaseJobLease(jobId) {
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  const gotLock = lock.tryLock(1000);
  if (!gotLock) return;
  try {
    props.deleteProperty('PDF_JOB_ACTIVE_' + jobId);
  } finally {
    lock.releaseLock();
  }
}


/**
 * Merge all PDF chunks and finish the job
 */
async function mergePdfChunksAndFinish(jobId) {
  const props = PropertiesService.getScriptProperties();

  try {
    updateJobStatus(jobId, 'RUNNING', 85, undefined, undefined, undefined, 'Merging PDFs...');
    logPdfEvent(jobId, 'INFO', 'Starting merge');

    const stateJson = props.getProperty('PDF_BATCH_STATE_' + jobId);
    const state = JSON.parse(stateJson);
    const job = getJobStatus(jobId);

    // Merge PDFs incrementally across ticks to reduce memory pressure
    const mergeResult = await mergePdfFileIdsIncremental(state.partialPdfIds, jobId, state.tempFolderId);
    if (!mergeResult.done) {
      updateJobStatus(jobId, 'RUNNING', 88, undefined, undefined, undefined, `Merging PDFs... (${mergeResult.index}/${mergeResult.total})`);
      enqueuePdfJob(jobId);
      return;
    }
    const mergedPdf = mergeResult.blob;

    updateJobStatus(jobId, 'RUNNING', 92, undefined, undefined, undefined, 'Saving to Drive...');

    // Save final PDF
    const dateFrom = typeof job.date_from === 'string' ? job.date_from : Utilities.formatDate(job.date_from, 'Europe/Paris', 'yyyy-MM-dd');
    const dateTo = typeof job.date_to === 'string' ? job.date_to : Utilities.formatDate(job.date_to, 'Europe/Paris', 'yyyy-MM-dd');
    const fileName = `Livre_${dateFrom}-${dateTo}_gen-${formatTimestamp()}_v01.pdf`;

    const pdfData = savePdfToFolder(mergedPdf, fileName);

    // Update job status
    updateJobStatus(jobId, 'DONE', 100, pdfData.fileId, pdfData.url, undefined, 'Done!');

    // Send email notification
    sendPdfReadyEmail(jobId, pdfData.url);

    // Cleanup
    cleanupBatchState(jobId);

  } catch (error) {
    Logger.log('Error merging PDFs: ' + error.message);
    logPdfEvent(jobId, 'ERROR', 'Merge failed', { message: String(error), stack: error && error.stack ? String(error.stack) : '' });
    updateJobStatus(jobId, 'ERROR', 0, undefined, undefined, String(error), 'Error during merge');
    cleanupBatchState(jobId);
  }
}

function finalizePdfChunks(jobId) {
  const props = PropertiesService.getScriptProperties();
  try {
    updateJobStatus(jobId, 'RUNNING', 92, undefined, undefined, undefined, 'Saving to Drive...');
    const stateJson = props.getProperty('PDF_BATCH_STATE_' + jobId);
    const state = stateJson ? JSON.parse(stateJson) : null;
    const job = getJobStatus(jobId);
    if (!state || !job) {
      throw new Error('Missing batch state or job');
    }

    const optionsJson = props.getProperty('PDF_OPTIONS_' + jobId);
    const pdfOptions = optionsJson ? JSON.parse(optionsJson) : {
      autoMerge: false,
      cleanChunks: false
    };
    let autoMerge = pdfOptions.autoMerge === true;
    const cleanChunks = pdfOptions.cleanChunks === true;
    if (autoMerge && !props.getProperty('GITHUB_TOKEN')) {
      autoMerge = false;
    }

    const folder = DriveApp.getFolderById(state.tempFolderId);
    if (autoMerge) {
      updateJobStatus(jobId, 'RUNNING', 10, undefined, undefined, undefined, 'Merge queued');
    } else {
      updateJobStatus(jobId, 'DONE', 100, undefined, undefined, undefined, 'Chunks ready (merge pending)');
    }
    sendPdfReadyEmail(jobId, folder.getUrl());
    if (autoMerge) {
      // Trigger merge workflow automatically
      const triggerResult = triggerPdfMergeWorkflow(jobId, folder.getId(), cleanChunks);
      if (!triggerResult.ok) {
        updateJobStatus(
          jobId,
          'DONE',
          100,
          undefined,
          undefined,
          undefined,
          `Merge trigger failed (code ${triggerResult.code || 'n/a'})`
        );
      }
    }
    cleanupBatchState(jobId);
  } catch (error) {
    Logger.log('Error finalizing PDFs: ' + error.message);
    logPdfEvent(jobId, 'ERROR', 'Finalize failed', { message: String(error), stack: error && error.stack ? String(error.stack) : '' });
    updateJobStatus(jobId, 'ERROR', 0, undefined, undefined, String(error), 'Error during finalize');
    cleanupBatchState(jobId);
  }
}

function triggerPdfMergeWorkflow(jobId, folderId, cleanChunks) {
  try {
    const props = PropertiesService.getScriptProperties();
    const githubToken = props.getProperty('GITHUB_TOKEN');
    const repo = props.getProperty('GITHUB_REPO') || 'Grut505/Rememly';
    const workflow = props.getProperty('GITHUB_PDF_MERGE_WORKFLOW') || 'pdf-merge.yml';
    const ref = props.getProperty('GITHUB_PDF_MERGE_REF') || 'main';

    if (!githubToken) {
      logPdfEvent(jobId, 'ERROR', 'GitHub token missing for merge trigger');
      return { ok: false, code: 0, message: 'Missing GitHub token' };
    }

    const response = UrlFetchApp.fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + githubToken,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        payload: JSON.stringify({
          ref: ref,
          inputs: {
            job_id: jobId,
            folder_id: folderId,
            clean_chunks: cleanChunks ? 'true' : 'false'
          }
        }),
        muteHttpExceptions: true
      }
    );

    const code = response.getResponseCode();
    const body = response.getContentText ? response.getContentText() : '';
    const ok = code >= 200 && code < 300;
    logPdfEvent(jobId, ok ? 'INFO' : 'ERROR', 'Merge workflow trigger', { code, body });
    return { ok, code, body };
  } catch (e) {
    logPdfEvent(jobId, 'ERROR', 'Merge workflow trigger failed', { message: String(e) });
    return { ok: false, code: 0, message: String(e) };
  }
}

function handlePdfMergeComplete(body) {
  try {
    const props = PropertiesService.getScriptProperties();
    const token = props.getProperty('PDF_MERGE_TOKEN');
    if (!token || body?.token !== token) {
      return createResponse({ ok: false, error: { code: 'FORBIDDEN', message: 'Invalid token' } });
    }
    const jobId = body?.job_id || getJobIdByChunksFolderId(body?.folder_id);
    const fileId = body?.file_id;
    const url = body?.url;
    if (!jobId || !fileId || !url) {
      return createResponse({ ok: false, error: { code: 'INVALID_PARAMS', message: 'Missing params' } });
    }

    const existingJob = getJobStatus(jobId);
    if (existingJob && existingJob.status === 'CANCELLED') {
      return createResponse({ ok: true, data: { ok: true, skipped: true } });
    }

    updateJobStatus(jobId, 'DONE', 100, fileId, url, undefined, 'Merged');
    if (body?.clean_chunks) {
      const job = getJobStatus(jobId);
      if (job && job.chunks_folder_id) {
        const pdfRoot = getPdfRootFolder();
        if (pdfRoot) {
          moveFileToFolder(fileId, pdfRoot);
        }
        trashFolder(job.chunks_folder_id);
      }
      updateJobChunksFolder(jobId, '', '');
    }
    sendPdfMergedEmail(jobId, url);
    logPdfEvent(jobId, 'INFO', 'Merge complete', { fileId, url });
    props.deleteProperty('PDF_MERGE_RUN_' + jobId);

    return createResponse({ ok: true, data: { ok: true } });
  } catch (e) {
    return createResponse({ ok: false, error: { code: 'MERGE_COMPLETE_FAILED', message: String(e) } });
  }
}

function handlePdfMergeStatus(body) {
  try {
    const props = PropertiesService.getScriptProperties();
    const token = props.getProperty('PDF_MERGE_TOKEN');
    if (!token || body?.token !== token) {
      return createResponse({ ok: false, error: { code: 'FORBIDDEN', message: 'Invalid token' } });
    }
    const jobId = body?.job_id;
    const progress = body?.progress;
    const message = body?.message;
    const runId = body?.run_id;
    if (!jobId || progress === undefined || message === undefined) {
      return createResponse({ ok: false, error: { code: 'INVALID_PARAMS', message: 'Missing params' } });
    }
    const job = getJobStatus(jobId);
    if (!job) {
      return createResponse({ ok: false, error: { code: 'NOT_FOUND', message: 'Job not found' } });
    }
    if ((job.status === 'DONE' && job.pdf_url) || job.status === 'CANCELLED' || job.status === 'ERROR') {
      return createResponse({ ok: true, data: { ok: true, skipped: true } });
    }
    if (runId) {
      props.setProperty('PDF_MERGE_RUN_' + jobId, String(runId));
    }
    logPdfEvent(jobId, 'INFO', 'Merge status update', { progress, message, runId: runId || null });
    updateJobStatus(jobId, 'RUNNING', progress, undefined, undefined, undefined, message);
    return createResponse({ ok: true, data: { ok: true } });
  } catch (e) {
    return createResponse({ ok: false, error: { code: 'MERGE_STATUS_FAILED', message: String(e) } });
  }
}

function handlePdfMergeFailed(body) {
  try {
    const props = PropertiesService.getScriptProperties();
    const token = props.getProperty('PDF_MERGE_TOKEN');
    if (!token || body?.token !== token) {
      return createResponse({ ok: false, error: { code: 'FORBIDDEN', message: 'Invalid token' } });
    }
    const jobId = body?.job_id;
    const message = body?.message || 'Merge failed';
    if (!jobId) {
      return createResponse({ ok: false, error: { code: 'INVALID_PARAMS', message: 'Missing job_id' } });
    }
    const job = getJobStatus(jobId);
    if (!job) {
      return createResponse({ ok: false, error: { code: 'NOT_FOUND', message: 'Job not found' } });
    }
    updateJobStatus(jobId, 'ERROR', 0, undefined, undefined, message, 'Merge failed');
    props.deleteProperty('PDF_MERGE_RUN_' + jobId);
    return createResponse({ ok: true, data: { ok: true } });
  } catch (e) {
    return createResponse({ ok: false, error: { code: 'MERGE_FAILED', message: String(e) } });
  }
}

function handlePdfMergeTrigger(body) {
  try {
    const jobId = body?.job_id;
    if (!jobId) {
      return createResponse({ ok: false, error: { code: 'INVALID_PARAMS', message: 'Missing job_id' } });
    }

    const job = getJobStatus(jobId);
    if (!job) {
      return createResponse({ ok: false, error: { code: 'NOT_FOUND', message: 'Job not found' } });
    }

    if (job.pdf_file_id || job.pdf_url) {
      return createResponse({ ok: true, data: { queued: false, message: 'Already merged' } });
    }

    if (!job.chunks_folder_id) {
      return createResponse({ ok: false, error: { code: 'MISSING_CHUNKS_FOLDER', message: 'Chunks folder not found' } });
    }

    const props = PropertiesService.getScriptProperties();
    const githubToken = props.getProperty('GITHUB_TOKEN');
    if (!githubToken) {
      return createResponse({ ok: false, error: { code: 'MISSING_GITHUB_TOKEN', message: 'GitHub token missing' } });
    }

    updateJobStatus(jobId, 'RUNNING', 10, undefined, undefined, '', 'Merge queued');
    const triggerResult = triggerPdfMergeWorkflow(jobId, job.chunks_folder_id);
    if (!triggerResult.ok) {
      updateJobStatus(
        jobId,
        'DONE',
        100,
        undefined,
        undefined,
        undefined,
        `Merge trigger failed (code ${triggerResult.code || 'n/a'})`
      );
      return createResponse({
        ok: false,
        error: {
          code: 'MERGE_TRIGGER_FAILED',
          message: `GitHub trigger failed (code ${triggerResult.code || 'n/a'})`
        }
      });
    }

    return createResponse({ ok: true, data: { queued: true, code: triggerResult.code } });
  } catch (e) {
    return createResponse({ ok: false, error: { code: 'MERGE_TRIGGER_FAILED', message: String(e) } });
  }
}

function handlePdfMergeCancel(body) {
  try {
    const jobId = body?.job_id;
    if (!jobId) {
      return createResponse({ ok: false, error: { code: 'INVALID_PARAMS', message: 'Missing job_id' } });
    }

    const job = getJobStatus(jobId);
    if (!job) {
      return createResponse({ ok: false, error: { code: 'NOT_FOUND', message: 'Job not found' } });
    }

    const props = PropertiesService.getScriptProperties();
    const runId = props.getProperty('PDF_MERGE_RUN_' + jobId);
    const githubToken = props.getProperty('GITHUB_TOKEN');
    const repo = props.getProperty('GITHUB_REPO') || 'Grut505/Rememly';
    if (runId && githubToken) {
      const response = UrlFetchApp.fetch(
        `https://api.github.com/repos/${repo}/actions/runs/${runId}/cancel`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + githubToken,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
          },
          muteHttpExceptions: true
        }
      );
      logPdfEvent(jobId, 'INFO', 'Merge workflow cancel', { runId, code: response.getResponseCode() });
    }

    updateJobStatus(jobId, 'ERROR', 0, undefined, undefined, 'Merge failed', 'Merge failed');
    props.deleteProperty('PDF_MERGE_RUN_' + jobId);
    return createResponse({ ok: true, data: { cancelled: true } });
  } catch (e) {
    return createResponse({ ok: false, error: { code: 'MERGE_CANCEL_FAILED', message: String(e) } });
  }
}

function handlePdfMergeCleanup(body) {
  try {
    const jobId = body?.job_id;
    if (!jobId) {
      return createResponse({ ok: false, error: { code: 'INVALID_PARAMS', message: 'Missing job_id' } });
    }
    const job = getJobStatus(jobId);
    if (!job) {
      return createResponse({ ok: false, error: { code: 'NOT_FOUND', message: 'Job not found' } });
    }
    if (!job.pdf_file_id || !job.pdf_url) {
      return createResponse({ ok: false, error: { code: 'MISSING_MERGED_PDF', message: 'Merged PDF not found' } });
    }
    if (!job.chunks_folder_id) {
      return createResponse({ ok: false, error: { code: 'NO_CHUNKS_FOLDER', message: 'No chunks folder to clean' } });
    }

    const pdfRoot = getPdfRootFolder();
    if (pdfRoot) {
      moveFileToFolder(job.pdf_file_id, pdfRoot);
    }
    trashFolder(job.chunks_folder_id);
    updateJobChunksFolder(jobId, '', '');
    updateJobStatus(jobId, job.status, undefined, undefined, undefined, undefined, 'Chunks cleaned');
    logPdfEvent(jobId, 'INFO', 'Merge cleanup', { moved: !!pdfRoot });

    return createResponse({ ok: true, data: { cleaned: true } });
  } catch (e) {
    return createResponse({ ok: false, error: { code: 'MERGE_CLEANUP_FAILED', message: String(e) } });
  }
}

function handlePdfJobByFolder(body) {
  try {
    const props = PropertiesService.getScriptProperties();
    const token = props.getProperty('PDF_MERGE_TOKEN');
    if (!token || body?.token !== token) {
      return createResponse({ ok: false, error: { code: 'FORBIDDEN', message: 'Invalid token' } });
    }
    const folderId = body?.folder_id;
    if (!folderId) {
      return createResponse({ ok: false, error: { code: 'INVALID_PARAMS', message: 'Missing folder_id' } });
    }
    const jobId = getJobIdByChunksFolderId(folderId);
    if (!jobId) {
      return createResponse({ ok: false, error: { code: 'NOT_FOUND', message: 'Job not found' } });
    }
    return createResponse({ ok: true, data: { job_id: jobId } });
  } catch (e) {
    return createResponse({ ok: false, error: { code: 'LOOKUP_FAILED', message: String(e) } });
  }
}

function sendPdfMergedEmail(jobId, pdfUrl) {
  try {
    const job = getJobStatus(jobId);
    if (!job || !job.created_by) return;

    const familyName = getConfigValue('family_name') || 'your family';
    const chunksFolderId = job.chunks_folder_id || '';

    MailApp.sendEmail({
      to: job.created_by,
      subject: `📚 Your memory book is ready!`,
      htmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Your memory book is ready!</h2>
          <p>Hello,</p>
          <p>The generation of your <strong>${familyName}</strong> memory book is complete.</p>
          <p>Period: from <strong>${job.date_from}</strong> to <strong>${job.date_to}</strong></p>
          <p style="margin: 20px 0;">
            <a href="${pdfUrl}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
              📥 Download merged PDF
            </a>
          </p>
          <p style="color: #666; font-size: 12px;">
            This link gives you access to the merged PDF on Google Drive.
          </p>
        </div>
      `
    });
  } catch (e) {
    Logger.log('Failed to send merged email: ' + e.message);
  }
}

function getPdfRootFolder() {
  const roots = DriveApp.getFoldersByName('Rememly');
  if (!roots.hasNext()) return null;
  const rememly = roots.next();
  const pdfFolders = rememly.getFoldersByName('pdf');
  if (!pdfFolders.hasNext()) return null;
  return pdfFolders.next();
}

function moveFileToFolder(fileId, folder) {
  try {
    const file = DriveApp.getFileById(fileId);
    file.moveTo(folder);
  } catch (e) {
    // Ignore move errors
  }
}

function trashFolder(folderId) {
  try {
    const folder = DriveApp.getFolderById(folderId);
    folder.setTrashed(true);
  } catch (e) {
    // Ignore trash errors
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

      // Avoid touching binary stream data: only rewrite before "stream" if present
      let preStream = body;
      let postStream = '';
      const streamIndex = body.indexOf('stream');
      if (streamIndex !== -1) {
        preStream = body.substring(0, streamIndex);
        postStream = body.substring(streamIndex);
      }

      // Replace all object references (N 0 R) with remapped numbers in pre-stream only
      preStream = preStream.replace(/(\d+)\s+0\s+R/g, (match, refNum) => {
        const newRef = objMapping[pdf.index][refNum];
        return newRef ? `${newRef} 0 R` : match;
      });

      // CRITICAL FIX: Update /Parent reference in Page objects to point to new Pages object
      const isPage = allPageRefs.includes(newObjNum);
      if (isPage) {
        // Replace /Parent N 0 R with /Parent pagesObjNum 0 R
        preStream = preStream.replace(/\/Parent\s+\d+\s+0\s+R/g, `/Parent ${pagesObjNum} 0 R`);
      }

      body = preStream + postStream;

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

    const familyName = getConfigValue('family_name') || 'your family';

    MailApp.sendEmail({
      to: job.created_by,
      subject: `📚 Your memory book is ready!`,
      htmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Your memory book is ready!</h2>
          <p>Hello,</p>
          <p>The generation of your <strong>${familyName}</strong> memory book is complete.</p>
          <p>Period: from <strong>${job.date_from}</strong> to <strong>${job.date_to}</strong></p>
          <p style="margin: 20px 0;">
            <a href="${pdfUrl}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
              📂 View generated PDFs
            </a>
          </p>
          ${chunksFolderId ? `
          <p style="margin: 12px 0 4px; font-size: 13px; color: #333;">
            Chunks folder ID (for merge script):
          </p>
          <div style="font-family: monospace; font-size: 12px; background: #f5f5f5; padding: 8px 10px; border-radius: 4px; word-break: break-all;">
            ${chunksFolderId}
          </div>
          ` : ''}
          <p style="color: #666; font-size: 12px;">
            This link gives you access to the folder containing all generated PDF parts.
          </p>
        </div>
      `
    });
    Logger.log('Email sent to: ' + job.created_by);
  } catch (e) {
    Logger.log('Failed to send email: ' + e.message);
  }
}

/**
 * Manual test helper for email sending
 */
function sendTestEmail(to) {
  if (!to) to = "grutspam@gmail.com"
  MailApp.sendEmail({
    to: to,
    subject: 'Rememly test email',
    htmlBody: '<p>This is a test email from Rememly.</p>'
  });
  Logger.log('Test email sent to: ' + to);
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
  // Always clean active/merge properties
  props.deleteProperty('PDF_JOB_ACTIVE_' + jobId);
  props.deleteProperty('PDF_MERGE_STATE_' + jobId);
}

// Legacy function for backward compatibility (simple generation without batch)
async function processOnePdfJob(jobId) {
  // Use batch processing instead
  initializeBatchState(jobId);
  await processNextPdfChunk(jobId);
}

/**
 * Group articles by month-year key
 */
function groupArticlesByMonth(articles) {
  const articlesByMonth = {};
  articles.forEach((article) => {
    const date = new Date(article.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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
 * Generate HTML for a chunk of a month (optional divider + subset of articles)
 */
function generateMonthChunkHtml(monthArticles, chunkArticles, monthName, year, monthIndex, startPage, totalPages, options = {}, includeDivider) {
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

  if (includeDivider) {
    currentPage++;
    const dividerHtml = generateMonthDivider(monthArticles, monthName, year, monthIndex, currentPage, totalPages, { mosaicLayout, showSeasonalFruits });
    html += dividerHtml.replace('page-break-before: always;', '').replace('class="month-divider"', 'class="month-divider" style="page-break-before: auto;"');
  }

  for (let i = 0; i < chunkArticles.length; i += 2) {
    currentPage++;
    html += `  <div class="articles-page">\n`;
    html += renderArticle(chunkArticles[i]);
    if (i + 1 < chunkArticles.length) {
      html += renderArticle(chunkArticles[i + 1]);
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

    .articles-page .page-number {
      margin-top: auto;
      align-self: flex-end;
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
 * NOTE: Uses async/await; caller must await.
 */
async function mergePdfBlobs(pdfBlobs) {
  if (pdfBlobs.length === 0) {
    throw new Error('No PDFs to merge');
  }

  if (pdfBlobs.length === 1) {
    return pdfBlobs[0];
  }

  // Use PDFApp library to merge PDFs
  const mergedBlob = await PDFApp.mergePDFs(pdfBlobs);
  mergedBlob.setName('merged.pdf');

  return mergedBlob;
}

/**
 * Incrementally merge PDFs by file ID to reduce memory pressure.
 * Uses PDFApp on small pairs instead of loading all blobs at once.
 */
async function mergePdfFileIdsIncremental(fileIds, jobId, tempFolderId) {
  if (!fileIds || fileIds.length === 0) {
    throw new Error('No PDFs to merge');
  }

  if (fileIds.length === 1) {
    const file = DriveApp.getFileById(fileIds[0]);
    return { done: true, blob: file.getBlob(), index: 1, total: 1 };
  }

  logPdfEvent(jobId, 'INFO', 'Incremental merge', { files: fileIds.length });

  const props = PropertiesService.getScriptProperties();
  const BATCH_SIZE = 1; // number of additional files to merge per tick
  const nativeThresholdMb = parseInt(getConfigValue('pdf_native_threshold_mb') || '', 10);
  const NATIVE_THRESHOLD_BYTES = (nativeThresholdMb ? nativeThresholdMb : 20) * 1024 * 1024;
  const mergeStrategy = (getConfigValue('pdf_merge_strategy') || 'native').toLowerCase();
  const mergeKey = 'PDF_MERGE_STATE_' + jobId;
  let mergeState = props.getProperty(mergeKey);
  let state = mergeState ? JSON.parse(mergeState) : null;

  if (!state) {
    state = {
      index: 1,
      total: fileIds.length,
      mergedFileId: fileIds[0],
    };
    props.setProperty(mergeKey, JSON.stringify(state));
  }

  if (state.index >= state.total) {
    const finalFile = DriveApp.getFileById(state.mergedFileId);
    props.deleteProperty(mergeKey);
    return { done: true, blob: finalFile.getBlob(), index: state.index, total: state.total };
  }

  const startIndex = state.index;
  const endIndex = Math.min(state.index + BATCH_SIZE, fileIds.length - 1);
  const mergedFile = DriveApp.getFileById(state.mergedFileId);
  const blobs = [mergedFile.getBlob()];
  const batchMeta = [];
  const batchStart = Date.now();

  for (let i = startIndex; i <= endIndex; i++) {
    const nextFileId = fileIds[i];
    const nextFile = DriveApp.getFileById(nextFileId);
    batchMeta.push({ index: i + 1, fileId: nextFileId, size: nextFile.getSize() });
    blobs.push(nextFile.getBlob());
  }

  logPdfEvent(jobId, 'INFO', 'Merging batch', {
    from: startIndex + 1,
    to: endIndex + 1,
    total: fileIds.length,
    batch: batchMeta,
  });

  const estimatedSize = mergedFile.getSize() + batchMeta.reduce((sum, b) => sum + (b.size || 0), 0);
  const useNative = mergeStrategy === 'native' || (mergeStrategy === 'auto' && estimatedSize >= NATIVE_THRESHOLD_BYTES);
  logPdfEvent(jobId, 'INFO', 'Merge strategy', { strategy: mergeStrategy, useNative, estimatedSize });

  let newMergedBlob;
  if (useNative) {
    try {
      newMergedBlob = mergePdfBlobsNative(blobs);
    } catch (e) {
      logPdfEvent(jobId, 'WARN', 'Native merge failed, falling back to PDFApp', { message: String(e) });
      newMergedBlob = await PDFApp.mergePDFs(blobs);
    }
  } else {
    try {
      newMergedBlob = await PDFApp.mergePDFs(blobs);
    } catch (e) {
      logPdfEvent(jobId, 'WARN', 'PDFApp merge failed, falling back to native', { message: String(e) });
      newMergedBlob = mergePdfBlobsNative(blobs);
    }
  }
  newMergedBlob.setName('merged.pdf');
  logPdfEvent(jobId, 'INFO', 'Batch merged', { elapsedMs: Date.now() - batchStart });

  const tempFolder = tempFolderId ? DriveApp.getFolderById(tempFolderId) : DriveApp.getRootFolder();
  const newFile = tempFolder.createFile(newMergedBlob);
  try {
    mergedFile.setTrashed(true);
  } catch (e) {
    // ignore
  }

  state.mergedFileId = newFile.getId();
  state.index = endIndex + 1;
  props.setProperty(mergeKey, JSON.stringify(state));

  return { done: false, index: state.index, total: state.total };
}

function cleanupOrphanPdfProperties() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const jobIds = getAllJobIdsSet();
  const prefixes = ['PDF_BATCH_STATE_', 'PDF_OPTIONS_', 'PDF_JOB_ACTIVE_', 'PDF_MERGE_STATE_'];
  let deleted = 0;

  Object.keys(all).forEach((key) => {
    const prefix = prefixes.find((p) => key.startsWith(p));
    if (!prefix) return;
    const jobId = key.slice(prefix.length);
    if (!jobIds.has(jobId)) {
      props.deleteProperty(key);
      deleted++;
    }
  });

  let queueRemoved = 0;
  try {
    const queue = JSON.parse(props.getProperty('PDF_JOB_QUEUE') || '[]');
    const filtered = queue.filter((id) => jobIds.has(id));
    queueRemoved = queue.length - filtered.length;
    props.setProperty('PDF_JOB_QUEUE', JSON.stringify(filtered));
  } catch (e) {
    // ignore
  }

  return { deleted, queueRemoved };
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

    // Skip non-active articles (drafts and deleted)
    if (article.status !== 'ACTIVE') {
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
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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

    .articles-page .page-number {
      margin-top: auto;
      align-self: flex-end;
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
    const monthIndex = parseInt(monthStr, 10) - 1;
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

function resizeImageBlob(blob, maxDim) {
  try {
    const bytes = blob.getBytes();
    const mimeType = blob.getContentType();
    const dimensions = getImageDimensions(bytes, mimeType);
    if (!dimensions) {
      return { blob, dimensions: null };
    }

    const maxSide = Math.max(dimensions.width, dimensions.height);
    if (!maxDim || maxSide <= maxDim) {
      return { blob, dimensions };
    }

    const scale = maxDim / maxSide;
    const targetW = Math.max(1, Math.round(dimensions.width * scale));
    const targetH = Math.max(1, Math.round(dimensions.height * scale));
    const resizedBlob = ImagesService.openImage(blob)
      .resize(targetW, targetH)
      .getBlob();

    return { blob: resizedBlob, dimensions };
  } catch (e) {
    return { blob, dimensions: null };
  }
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
  const coverMaxDim = parseInt(getConfigValue('pdf_cover_max_dim') || '', 10) || 800;

  for (const article of articles) {
    if (article.image_file_id && images.length < photoLimit) {
      try {
        const file = DriveApp.getFileById(article.image_file_id);
        const originalBlob = file.getBlob();
        const resized = resizeImageBlob(originalBlob, coverMaxDim);
        const base64 = Utilities.base64Encode(resized.blob.getBytes());
        const mimeType = resized.blob.getContentType();
        const dimensions = resized.dimensions;

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
