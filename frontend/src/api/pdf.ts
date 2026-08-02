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
  cover_family_outline_color?: string
  cover_title_font_family?: string
  cover_title_font_weight?: number
  cover_title_letter_spacing_em?: number
  cover_title_scale_x?: number
  cover_title_scale_y?: number
  cover_title_x_cm?: number
  cover_title_y_cm?: number
  cover_title_w_cm?: number
  cover_title_h_cm?: number
  cover_title_color?: string
  cover_subtitle_font_family?: string
  cover_subtitle_font_weight?: number
  cover_subtitle_letter_spacing_em?: number
  cover_subtitle_scale_x?: number
  cover_subtitle_scale_y?: number
  cover_subtitle_x_cm?: number
  cover_subtitle_y_cm?: number
  cover_subtitle_w_cm?: number
  cover_subtitle_h_cm?: number
  cover_subtitle_color?: string
  preview_solid?: boolean
  auto_merge?: boolean
  clean_chunks?: boolean
  blurb_mode_enabled?: boolean
  blurb_format?: 'magazine_premium' | 'standard_portrait'
  blurb_cover_type?: 'softcover' | 'hardcover'
  blurb_paper_type?: string
  blurb_front_bg_color?: string
  blurb_back_bg_color?: string
  blurb_spine_bg_color?: string
  blurb_back_cover_style?: 'color' | 'mosaic'
  blurb_mirror_odd_pages?: boolean
  blurb_spine_text?: string
  blurb_spine_text_color?: string
  blurb_spine_font_family?: string
  blurb_spine_font_size_cm?: number
  blurb_preview_page_count?: number
  project_id?: string
  project_name?: string
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
  chunks_count?: number
  error_message?: string
  is_blurb?: boolean
  options_json?: string
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
  meta?: { target_page?: number }
}

export interface PreviewStatusResponse {
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'ERROR'
  error_message?: string
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

  previewStatus: (fileId: string) =>
    apiClient.get<PreviewStatusResponse>('pdf/preview-status', { preview_id: fileId }),

  previewCoverContent: (fileId: string) =>
    apiClient.post<CoverPreviewContentResponse>('pdf/cover-preview-content', { file_id: fileId }),

  deleteCoverPreview: (fileId: string) =>
    apiClient.post<{ deleted: boolean }>('pdf/cover-preview-delete', { file_id: fileId }),

  previewArticle: (payload: {
    start_date: string
    article: {
      id?: string
      date: string
      texte?: string
      image_file_id?: string
      image?: { base64: string; mimeType?: string }
    }
  }) => apiClient.post<CoverPreviewResponse>('pdf/article-preview', payload),

  // The article-preview render script reuses pdf/preview-complete (the same
  // generic pdf_previews row a cover preview uses), so its content/delete
  // are the same cover-preview endpoints too - no separate ones needed.
  previewArticleContent: (fileId: string) =>
    apiClient.post<CoverPreviewContentResponse>('pdf/cover-preview-content', { file_id: fileId }),

  deleteArticlePreview: (fileId: string) =>
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
