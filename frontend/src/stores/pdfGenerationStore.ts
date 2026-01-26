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
  }, onComplete?: () => void) => Promise<void>
  pollJobStatus: (jobId: string) => Promise<void>
  setLastCompletedJob: (job: PdfListItem | null) => void
  dismissSuccess: () => void
  dismissError: () => void
  reset: () => void
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
      progressMessage: 'Démarrage...',
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

      if (response.status === 'DONE' && response.pdf_url) {
        // Rare case: job completed immediately
        set({
          isGenerating: false,
          progress: 100,
          progressMessage: 'Terminé !',
          pdfUrl: response.pdf_url,
          showSuccess: true,
        })
        if (onComplete) onComplete()
      } else if (response.status === 'ERROR') {
        set({
          isGenerating: false,
          error: 'La génération du PDF a échoué',
          progressMessage: '',
        })
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
      }
    } catch (err) {
      set({
        isGenerating: false,
        error: err instanceof Error ? err.message : 'Erreur lors de la génération',
        progressMessage: '',
      })
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
          error: job.error_message || 'La génération du PDF a échoué',
        })
      } else {
        // Still running, poll again
        setTimeout(() => get().pollJobStatus(jobId), 1000)
      }
    } catch (err) {
      set({
        isGenerating: false,
        error: err instanceof Error ? err.message : 'Erreur lors du suivi',
      })
    }
  },

  setLastCompletedJob: (job) => {
    set({
      lastCompletedJob: job,
      showSuccess: job !== null,
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
