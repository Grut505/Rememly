# PDF Generation Logic

This document summarizes how PDF generation works in the backend.

## High-Level Flow
1. Create job: the frontend calls `pdf/create` to create a job row in the `jobs_pdf` sheet.
2. Process trigger: the frontend calls `pdf/process` (fire-and-forget). This initializes state and enqueues the job.
3. Worker tick: a time-based trigger (`pdfWorkerTick`) runs every minute, dequeues a job, and processes one chunk.
4. Chunks:
   - Chunk 0 = cover
   - Chunk 1..N = one month at a time
5. Merge: once all chunks are generated, PDFs are merged into a final file, saved to Drive, and the job is marked `DONE`.

### Sequence Diagram (Text)
```
Frontend          Apps Script            Script Properties           Drive
   |                  |                          |                    |
   | pdf/create       |                          |                    |
   |----------------->| create job row           |                    |
   |<-----------------| job_id                   |                    |
   | pdf/process      |                          |                    |
   |----------------->| init state + enqueue     | PDF_JOB_QUEUE      |
   |                  |------------------------->| (push jobId)       |
   |                  |                          |                    |
   |  (time trigger)  | pdfWorkerTick            |                    |
   |                  | dequeue job              | PDF_JOB_QUEUE      |
   |                  |------------------------->| (shift jobId)      |
   |                  | process chunk            |                    |
   |                  |--------------------------> create temp PDFs   |
   |                  | update state/progress     | PDF_BATCH_STATE_*  |
   |                  |------------------------->|                    |
   |                  | enqueue if not done       | PDF_JOB_QUEUE      |
   |                  |------------------------->| (push jobId)       |
   |                  |                          |                    |
   |                  | merge when last chunk     |                    |
   |                  |--------------------------> save final PDF     |
   |                  | update job row            | jobs_pdf sheet     |
   |<-----------------| DONE + url                |                    |
```

## Components

### Queue + Worker
- Queue stored in Script Properties: `PDF_JOB_QUEUE`
- Worker trigger: `pdfWorkerTick` (time-based, every minute)
- Concurrency: `ScriptLock` ensures the queue and chunk processing are safe
- Re-enqueue: if a job is not finished, it is put back into the queue

### Job State (Script Properties)
- `PDF_BATCH_STATE_<jobId>`: batch state (current chunk, total pages, temp folder, etc.)
- `PDF_OPTIONS_<jobId>`: job options (layout, seasonal fruits, max photos, keep temp files)

### Job Row (Sheet: `jobs_pdf`)
Fields include:
- `job_id`, `created_at`, `created_by`, `year`, `date_from`, `date_to`
- `status`, `progress`, `progress_message`
- `pdf_file_id`, `pdf_url`
- `temp_folder_id`, `temp_folder_url` (when keep-temp is enabled)

## Options
Options are stored at creation time and used during generation.
```json
{
  "mosaic_layout": "full" | "centered",
  "show_seasonal_fruits": true | false,
  "max_mosaic_photos": number,
  "keep_temp": true | false
}
```

## Chunk Processing Details

### Cover (Chunk 0)
- Builds a cover-only HTML page
- Converts to PDF
- Saves to temp folder as `chunk_000_cover.pdf`

### Month Chunks (1..N)
- One month per chunk
- Builds month divider + article pages (2 articles per page)
- Converts to PDF
- Saves to temp folder as `chunk_XXX_YYYY-MM.pdf`

### Page Counting
- Total pages are computed up front:
  - 1 cover page
  - 1 divider per month
  - 1 page per 2 articles

## Merge Step
- Primary: PDFApp library (`PDFApp.mergePDFs`) is used to preserve text streams
- Output: final PDF is saved via `savePdfToFolder`
- Status update: job marked `DONE` with file ID and URL

## Cleanup
- Temporary folder is deleted unless `keep_temp` is true
- Script properties for the job are removed (unless keep-temp is enabled)
- When a job is deleted, its PDF file and temp folder (if any) are trashed

## Cancellation
- A cancel request removes batch state and temp data immediately
- The job row is deleted from the sheet

## Notes / Limits
- The worker processes one chunk at a time to avoid Apps Script timeouts
- Jobs are processed sequentially via the queue (no true parallelism)
- The system is safe for multiple users because each job has isolated state

## Job Status Lifecycle
Typical status progression:
```
PENDING -> RUNNING -> DONE
                \-> ERROR
```
On cancel:
```
PENDING/RUNNING -> (row deleted)
```

## Timings & Quotas (Apps Script)
- Chunk processing is split to avoid execution time limits.
- The time-based trigger runs every minute; heavy backlogs will take longer to drain.
- Drive and Spreadsheet calls are the most expensive parts; keep batch sizes reasonable.

## Troubleshooting
**PDF text corrupted after merge**
- Use `PDFApp.mergePDFs` (current default) to preserve text streams.
- Native merge is fragile and should be avoided for production.

**Jobs stuck in RUNNING**
- Check if the worker trigger is installed and running.
- Verify the queue (`PDF_JOB_QUEUE`) is being re-enqueued.
- Look for errors in Apps Script logs.

**Temp folders not cleaned**
- If `keep_temp` is true, folders are preserved by design.
- Otherwise, cleanup runs after merge/cancel; confirm permissions for Drive.
