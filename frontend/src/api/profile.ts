import { apiClient } from './client'

export interface UserProfile {
  email: string
  pseudo: string
  avatar_url: string
  avatar_file_id: string
  avatar_base64?: string
}

export interface SaveProfilePayload {
  pseudo: string
  avatar?: string // base64 image data
}

export const profileApi = {
  async get(): Promise<UserProfile> {
    return apiClient.get<UserProfile>('profile/get')
  },

  async save(payload: SaveProfilePayload): Promise<UserProfile> {
    return apiClient.post<UserProfile>('profile/save', payload)
  },
}
