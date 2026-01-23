import { apiClient } from './client'
import { PdfJob } from './types'

export interface PdfOptions {
  mosaic_layout?: 'full' | 'centered'
  show_seasonal_fruits?: boolean
  max_mosaic_photos?: number
}

export interface CreatePdfPayload {
  from: string
  to: string
  options?: PdfOptions
}

export interface CreatePdfResponse {
  job_id: string
  status: string
  progress: number
  progress_message?: string
  pdf_file_id?: string
  pdf_url?: string
}

export interface PdfListItem {
  job_id: string
  created_at: string
  created_by: string
  year: number
  date_from: string
  date_to: string
  status: string
  pdf_url: string
  pdf_file_id: string
}

export interface PdfListResponse {
  items: PdfListItem[]
  authors: string[]
}

export const pdfApi = {
  create: (payload: CreatePdfPayload) =>
    apiClient.post<CreatePdfResponse>('pdf/create', payload),

  status: (jobId: string) =>
    apiClient.get<PdfJob>('pdf/status', { job_id: jobId }),

  list: (params?: { date_from?: string; date_to?: string; author?: string }) =>
    apiClient.get<PdfListResponse>('pdf/list', params),

  delete: (jobId: string) =>
    apiClient.post<{ deleted: boolean }>('pdf/delete', { job_id: jobId }),
}
