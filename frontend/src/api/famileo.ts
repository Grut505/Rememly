import { apiClient } from './client'

export interface FamileoPost {
  id: number
  text: string
  date: string
  date_tz: string
  author_id: number
  author_name: string
  author_email: string
  author_pseudo: string
  image_url: string
  full_image_url: string
  image_orientation: 'landscape' | 'portrait'
}

export interface FamileoPostsResponse {
  posts: FamileoPost[]
  unread: number
  next_timestamp: string | null
  has_more: boolean
  counts?: {
    declared: number
    others: number
    total: number
  }
}

export interface FamileoImageResponse {
  base64: string
  mimeType: string
}

export interface FamileoStatusResponse {
  configured: boolean
  valid: boolean
  message: string
}

export interface FamileoTriggerRefreshResponse {
  message: string
}

export interface FamileoFamily {
  id: string
  name: string
  famileo_id: string
}

export interface FamileoFamiliesResponse {
  families: FamileoFamily[]
}

export interface FamileoImportedIdsResponse {
  ids: string[]
}

export interface FamileoImportedFingerprintsResponse {
  fingerprints: string[]
}

export interface FamileoCreatePostResponse {
  status: number
  body: string
}

export interface FamileoPresignResponse {
  raw: string
}

export interface FamileoUploadImageResponse {
  status: number
  body: string
  key?: string
}

export const famileoApi = {
  status: (params?: { validate?: string; family_id?: string }) =>
    apiClient.get<FamileoStatusResponse>('famileo/status', params),

  posts: (
    params?: { limit?: string; timestamp?: string; family_id?: string; author_filter?: string },
    options?: RequestInit
  ) =>
    apiClient.get<FamileoPostsResponse>('famileo/posts', params, options),

  image: (url: string) =>
    apiClient.get<FamileoImageResponse>('famileo/image', { url: encodeURIComponent(url) }),

  triggerRefresh: () =>
    apiClient.get<FamileoTriggerRefreshResponse>('famileo/trigger-refresh'),

  families: () =>
    apiClient.get<FamileoFamiliesResponse>('famileo/families'),

  importedIds: () =>
    apiClient.get<FamileoImportedIdsResponse>('famileo/imported-ids'),

  importedFingerprints: () =>
    apiClient.get<FamileoImportedFingerprintsResponse>('famileo/imported-fingerprints'),

  createPost: (body: { text: string; published_at: string; family_id?: string; image_key?: string; is_full_page?: boolean; author_email?: string }) =>
    apiClient.post<FamileoCreatePostResponse>('famileo/create-post', body),

  presignImage: () =>
    apiClient.post<FamileoPresignResponse>('famileo/presigned-image'),

  uploadImage: (body: { presign: string | Record<string, unknown>; image_base64: string; mime_type?: string; filename?: string }) =>
    apiClient.post<FamileoUploadImageResponse>('famileo/upload-image', body),
}
