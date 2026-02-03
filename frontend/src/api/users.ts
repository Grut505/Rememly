import { apiClient } from './client'

export interface DeclaredUser {
  email: string
  pseudo: string
  famileo_name: string
  avatar_url: string
  avatar_file_id: string
  status: string
  date_created: string
  date_updated: string
}

export interface UsersListResponse {
  users: DeclaredUser[]
}

export const usersApi = {
  list: () => apiClient.get<UsersListResponse>('users/list'),
}
