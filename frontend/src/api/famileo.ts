import { apiClient } from './client'

export interface FamileoPost {
  id: number
  text: string
  date: string
  date_tz: string
  author_id: number
  author_name: string
  rememly_author: string
  image_url: string
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
  message: string
}

export const famileoApi = {
  status: () =>
    apiClient.get<FamileoStatusResponse>('famileo/status'),

  posts: (params?: { limit?: string; timestamp?: string }) =>
    apiClient.get<FamileoPostsResponse>('famileo/posts', params),

  image: (url: string) =>
    apiClient.get<FamileoImageResponse>('famileo/image', { url: encodeURIComponent(url) }),
}
