import { apiClient } from './client'
import { PdfJob } from './types'

export interface CreatePdfPayload {
  from: string
  to: string
}

export interface CreatePdfResponse {
  job_id: string
  status: string
  progress: number
  pdf_file_id?: string
  pdf_url?: string
}

export const pdfApi = {
  create: (payload: CreatePdfPayload) =>
    apiClient.post<CreatePdfResponse>('pdf/create', payload),

  status: (jobId: string) =>
    apiClient.get<PdfJob>('pdf/status', { job_id: jobId }),
}
