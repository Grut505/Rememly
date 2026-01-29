import { create } from 'zustand'
import { pdfApi, PdfListItem } from '../api/pdf'

interface PdfGenerationState {
  // Current generation (used during initial creation)
  isGenerating: boolean
  jobId: string | null
  progress: number
  progressMessage: string
  error: string | null

  // Result
  pdfUrl: string | null
  showSuccess: boolean

  // Last completed job (for notification when polling detects completion)
  lastCompletedJob: PdfListItem | null

  // Callback when generation completes
  onCompleteCallback: (() => void) | null

  // Actions
  startGeneration: (from: string, to: string, options: {
    mosaic_layout?: 'full' | 'centered'
    show_seasonal_fruits?: boolean
    max_mosaic_photos?: number
    auto_merge?: boolean
    clean_chunks?: boolean
  }, onComplete?: () => void) => Promise<PdfListItem | null>
  pollJobStatus: (jobId: string) => Promise<void>
  setLastCompletedJob: (job: PdfListItem | null) => void
  dismissSuccess: () => void
  dismissError: () => void
  reset: () => void
}

const getCurrentUserEmail = (): string => {
  try {
    const userJson = localStorage.getItem('user')
    if (!userJson) return 'me'
    const user = JSON.parse(userJson)
    return user.email || 'me'
  } catch {
    return 'me'
  }
}

const getCurrentUserName = (): string | null => {
  try {
    const userJson = localStorage.getItem('user')
    if (!userJson) return null
    const user = JSON.parse(userJson)
    return user.name || null
  } catch {
    return null
  }
}

const normalizeStatus = (status: string): PdfListItem['status'] => {
  if (status === 'PENDING' || status === 'RUNNING' || status === 'DONE' || status === 'ERROR' || status === 'CANCELLED') {
    return status
  }
  return 'PENDING'
}

export const usePdfGenerationStore = create<PdfGenerationState>((set, get) => ({
  isGenerating: false,
  jobId: null,
  progress: 0,
  progressMessage: '',
  error: null,
  pdfUrl: null,
  showSuccess: false,
  lastCompletedJob: null,
  onCompleteCallback: null,

  startGeneration: async (from, to, options, onComplete) => {
    set({
      isGenerating: true,
      jobId: null,
      progress: 0,
      progressMessage: 'Starting...',
      error: null,
      pdfUrl: null,
      showSuccess: false,
      lastCompletedJob: null,
      onCompleteCallback: onComplete || null,
    })

    try {
      const response = await pdfApi.create({
        from,
        to,
        options,
      })

      const createdAt = new Date().toISOString()
      const createdBy = getCurrentUserEmail()
      const createdByPseudo = getCurrentUserName() || createdBy.split('@')[0]
      const jobItem: PdfListItem = {
        job_id: response.job_id,
        created_at: createdAt,
        created_by: createdBy,
        created_by_pseudo: createdByPseudo,
        date_from: from,
        date_to: to,
        status: normalizeStatus(response.status),
        progress: response.progress,
        progress_message: response.progress_message,
        pdf_url: response.pdf_url,
        pdf_file_id: response.pdf_file_id,
      }

      if (response.status === 'DONE' && response.pdf_url) {
        // Rare case: job completed immediately
        set({
          isGenerating: false,
          progress: 100,
          progressMessage: 'Done!',
          pdfUrl: response.pdf_url,
          showSuccess: true,
        })
        if (onComplete) onComplete()
        return jobItem
      } else if (response.status === 'ERROR') {
        set({
          isGenerating: false,
          error: 'PDF generation failed',
          progressMessage: '',
        })
        return null
      } else {
        // Job started (PENDING)
        // Progress will be shown in the list via polling in PdfExport
        set({
          isGenerating: false, // No longer showing progress in notification
          jobId: response.job_id,
        })

        // Fire and forget: trigger the actual PDF generation
        pdfApi.process(response.job_id).catch(() => {
          // Ignore errors here - list polling will catch any issues
        })

        // Call onComplete to trigger list refresh (job will appear in list)
        if (onComplete) onComplete()
        return jobItem
      }
    } catch (err) {
      set({
        isGenerating: false,
        error: err instanceof Error ? err.message : 'Error while generating PDF',
        progressMessage: '',
      })
      return null
    }
  },

  pollJobStatus: async (jobId: string) => {
    try {
      const job = await pdfApi.status(jobId)

      set({
        progress: job.progress || 0,
        progressMessage: job.progress_message || '',
      })

      if (job.status === 'DONE') {
        const callback = get().onCompleteCallback
        set({
          isGenerating: false,
          pdfUrl: job.pdf_url || null,
          showSuccess: true,
        })
        // Call the callback to refresh the list
        if (callback) {
          callback()
        }
      } else if (job.status === 'ERROR') {
        set({
          isGenerating: false,
          error: job.error_message || 'PDF generation failed',
        })
      } else {
        // Still running, poll again
        setTimeout(() => get().pollJobStatus(jobId), 1000)
      }
    } catch (err) {
      set({
        isGenerating: false,
        error: err instanceof Error ? err.message : 'Error while tracking job',
      })
    }
  },

  setLastCompletedJob: (job) => {
    set({
      lastCompletedJob: job,
      showSuccess: !!job?.pdf_url,
      pdfUrl: job?.pdf_url || null,
    })
  },

  dismissSuccess: () => {
    set({ showSuccess: false, pdfUrl: null, lastCompletedJob: null })
  },

  dismissError: () => {
    set({ error: null })
  },

  reset: () => {
    set({
      isGenerating: false,
      jobId: null,
      progress: 0,
      progressMessage: '',
      error: null,
      pdfUrl: null,
      showSuccess: false,
      lastCompletedJob: null,
      onCompleteCallback: null,
    })
  },
}))
