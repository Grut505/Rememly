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

export const famileoApi = {
  status: (params?: { validate?: string; family_id?: string }) =>
    apiClient.get<FamileoStatusResponse>('famileo/status', params),

  posts: (params?: { limit?: string; timestamp?: string; family_id?: string }) =>
    apiClient.get<FamileoPostsResponse>('famileo/posts', params),

  image: (url: string) =>
    apiClient.get<FamileoImageResponse>('famileo/image', { url: encodeURIComponent(url) }),

  triggerRefresh: () =>
    apiClient.get<FamileoTriggerRefreshResponse>('famileo/trigger-refresh'),

  families: () =>
    apiClient.get<FamileoFamiliesResponse>('famileo/families'),

  importedIds: () =>
    apiClient.get<FamileoImportedIdsResponse>('famileo/imported-ids'),
}
