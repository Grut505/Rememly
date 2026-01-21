import { apiClient } from './client'
import { Article, ListArticlesResponse } from './types'

export interface CreateArticlePayload {
  auteur: string
  texte: string
  image: {
    fileName: string
    mimeType: string
    base64: string
  }
  date?: string
  famileo_post_id?: string
  assembly_state?: object | null
  full_page?: boolean
}

export interface UpdateArticlePayload {
  id: string
  texte?: string
  image?: {
    fileName: string
    mimeType: string
    base64: string
  }
  date?: string
  assembly_state?: object | null
  full_page?: boolean
  status?: 'ACTIVE' | 'DELETED'
}

export interface ListArticlesFilters {
  year?: string
  month?: string
  from?: string
  to?: string
  limit?: string
  cursor?: string
  status_filter?: 'active' | 'all' | 'deleted'
}

export const articlesApi = {
  list: (filters?: ListArticlesFilters) =>
    apiClient.get<ListArticlesResponse>('articles/list', filters as Record<string, string | undefined>),

  get: (id: string) =>
    apiClient.get<Article>('articles/get', { id }),

  create: (payload: CreateArticlePayload) =>
    apiClient.post<Article>('articles/create', payload),

  update: (payload: UpdateArticlePayload) =>
    apiClient.post<Article>('articles/update', payload),

  delete: (id: string) =>
    apiClient.get<{ id: string; deleted: boolean }>('articles/delete', { id }),
}
