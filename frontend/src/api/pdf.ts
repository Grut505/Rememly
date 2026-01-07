import { apiClient } from './client'
import { PdfJob } from './types'

export interface CreatePdfPayload {
  from: string
  to: string
}

export const pdfApi = {
  create: (payload: CreatePdfPayload) =>
    apiClient.post<{ job_id: string }>('pdf/create', payload),

  status: (jobId: string) =>
    apiClient.get<PdfJob>('pdf/status', { job_id: jobId }),
}
