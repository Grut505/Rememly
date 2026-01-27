import { apiClient } from './client'
import { PdfJob } from './types'

export interface PdfOptions {
  mosaic_layout?: 'full' | 'centered'
  show_seasonal_fruits?: boolean
  max_mosaic_photos?: number
  keep_temp?: boolean
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
  created_by_pseudo?: string
  year: number
  date_from: string
  date_to: string
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'ERROR' | 'CANCELLED'
  progress?: number
  progress_message?: string
  pdf_url?: string
  pdf_file_id?: string
  temp_folder_id?: string
  temp_folder_url?: string
  error_message?: string
}

export interface PdfListResponse {
  items: PdfListItem[]
  authors: string[]
}

export const pdfApi = {
  create: (payload: CreatePdfPayload) =>
    apiClient.post<CreatePdfResponse>('pdf/create', payload),

  // Fire and forget - triggers the actual PDF generation
  process: (jobId: string) =>
    apiClient.get<{ processed: boolean }>('pdf/process', { job_id: jobId }),

  status: (jobId: string) =>
    apiClient.get<PdfJob>('pdf/status', { job_id: jobId }),

  list: (params?: { date_from?: string; date_to?: string; author?: string; include_in_progress?: boolean }) => {
    // Convert boolean to string for the API
    const queryParams: Record<string, string | undefined> | undefined = params ? {
      date_from: params.date_from,
      date_to: params.date_to,
      author: params.author,
      include_in_progress: params.include_in_progress ? 'true' : undefined,
    } : undefined
    return apiClient.get<PdfListResponse>('pdf/list', queryParams)
  },

  delete: (jobId: string) =>
    apiClient.post<{ deleted: boolean }>('pdf/delete', { job_id: jobId }),

  cancel: (jobId: string) =>
    apiClient.post<{ cancelled: boolean; job_id: string }>('pdf/cancel', { job_id: jobId }),
}
