import { create } from 'zustand'
import { pdfApi } from '../api/pdf'

interface PdfGenerationState {
  // Current generation
  isGenerating: boolean
  jobId: string | null
  progress: number
  progressMessage: string
  error: string | null

  // Result
  pdfUrl: string | null
  showSuccess: boolean

  // Actions
  startGeneration: (from: string, to: string, options: {
    mosaic_layout?: 'full' | 'centered'
    show_seasonal_fruits?: boolean
    max_mosaic_photos?: number
  }) => Promise<void>
  pollJobStatus: (jobId: string) => Promise<void>
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

  startGeneration: async (from, to, options) => {
    set({
      isGenerating: true,
      jobId: null,
      progress: 0,
      progressMessage: 'Démarrage...',
      error: null,
      pdfUrl: null,
      showSuccess: false,
    })

    try {
      const response = await pdfApi.create({
        from,
        to,
        options,
      })

      if (response.status === 'DONE' && response.pdf_url) {
        set({
          isGenerating: false,
          progress: 100,
          progressMessage: 'Terminé !',
          pdfUrl: response.pdf_url,
          showSuccess: true,
        })
      } else if (response.status === 'ERROR') {
        set({
          isGenerating: false,
          error: 'La génération du PDF a échoué',
          progressMessage: '',
        })
      } else {
        // Job started, poll for completion
        set({ jobId: response.job_id })
        get().pollJobStatus(response.job_id)
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
        set({
          isGenerating: false,
          pdfUrl: job.pdf_url || null,
          showSuccess: true,
        })
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

  dismissSuccess: () => {
    set({ showSuccess: false, pdfUrl: null })
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
    })
  },
}))
