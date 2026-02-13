import { apiClient } from './client'
import { PdfJob } from './types'

export interface PdfOptions {
  mosaic_layout?: 'full' | 'centered'
  show_seasonal_fruits?: boolean
  max_mosaic_photos?: number
  cover_style?: 'mosaic' | 'masked-title'
  family_name?: string
  cover_title?: string
  cover_subtitle?: string
  cover_vertical_letter_spacing_em?: number
  cover_family_x_cm?: number
  cover_family_font_family?: string
  cover_family_font_weight?: number
  cover_family_letter_spacing_em?: number
  cover_family_h_cm?: number
  cover_family_scale_x?: number
  cover_family_scale_y?: number
  cover_family_outline_px?: number
  cover_title_font_family?: string
  cover_title_font_weight?: number
  cover_title_letter_spacing_em?: number
  cover_title_scale_x?: number
  cover_title_scale_y?: number
  cover_title_x_cm?: number
  cover_title_y_cm?: number
  cover_title_w_cm?: number
  cover_title_h_cm?: number
  cover_subtitle_font_family?: string
  cover_subtitle_font_weight?: number
  cover_subtitle_letter_spacing_em?: number
  cover_subtitle_scale_x?: number
  cover_subtitle_scale_y?: number
  cover_subtitle_x_cm?: number
  cover_subtitle_y_cm?: number
  cover_subtitle_w_cm?: number
  cover_subtitle_h_cm?: number
  preview_solid?: boolean
  auto_merge?: boolean
  clean_chunks?: boolean
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
  date_from: string
  date_to: string
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'ERROR' | 'CANCELLED'
  progress?: number
  progress_message?: string
  pdf_url?: string
  pdf_file_id?: string
  chunks_folder_id?: string
  chunks_folder_url?: string
  error_message?: string
}

export interface PdfListResponse {
  items: PdfListItem[]
  authors: string[]
}

export interface CoverPreviewResponse {
  file_id: string
  url: string
}

export interface CoverPreviewContentResponse {
  mime_type: string
  base64: string
}

export interface MergeTokenStatusResponse {
  configured: boolean
  has_refresh_token?: boolean
  has_access_token?: boolean
  expiry?: string
  client_id_suffix?: string
  parse_error?: boolean
}

export const pdfApi = {
  create: (payload: CreatePdfPayload) =>
    apiClient.post<CreatePdfResponse>('pdf/create', payload),

  previewCover: (payload: CreatePdfPayload) =>
    apiClient.post<CoverPreviewResponse>('pdf/cover-preview', payload),

  previewCoverContent: (fileId: string) =>
    apiClient.post<CoverPreviewContentResponse>('pdf/cover-preview-content', { file_id: fileId }),

  deleteCoverPreview: (fileId: string) =>
    apiClient.post<{ deleted: boolean }>('pdf/cover-preview-delete', { file_id: fileId }),

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

  triggerMerge: (jobId: string) =>
    apiClient.post<{ queued: boolean; message?: string }>('pdf/merge-trigger', { job_id: jobId }),

  cancelMerge: (jobId: string) =>
    apiClient.post<{ cancelled: boolean }>('pdf/merge-cancel', { job_id: jobId }),

  cleanupMerge: (jobId: string) =>
    apiClient.post<{ cleaned: boolean }>('pdf/merge-cleanup', { job_id: jobId }),

  mergeTokenStatus: () =>
    apiClient.post<MergeTokenStatusResponse>('pdf/merge-token-status'),

  refreshMergeToken: () =>
    apiClient.post<{ refreshed: boolean; expiry?: string; has_refresh_token?: boolean }>('pdf/merge-token-refresh'),

  cancel: (jobId: string) =>
    apiClient.post<{ cancelled: boolean; job_id: string }>('pdf/cancel', { job_id: jobId }),
}
