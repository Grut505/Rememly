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
  status?: 'ACTIVE' | 'DRAFT' | 'DELETED'
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
  status?: 'ACTIVE' | 'DRAFT' | 'DELETED'
}

export interface ListArticlesFilters {
  year?: string
  month?: string
  from?: string
  to?: string
  author?: string
  duplicates_only?: string
  limit?: string
  cursor?: string
  status_filter?: 'active' | 'draft' | 'all' | 'deleted'
  source_filter?: 'all' | 'famileo' | 'local'
}

export interface ArticlesAuthorsResponse {
  authors: { email: string; pseudo: string }[]
}

export const articlesApi = {
  list: (filters?: ListArticlesFilters) =>
    apiClient.get<ListArticlesResponse>('articles/list', filters as Record<string, string | undefined>),
  authors: (filters?: { status_filter?: 'active' | 'draft' | 'all' | 'deleted'; source_filter?: 'all' | 'famileo' | 'local' }) =>
    apiClient.get<ArticlesAuthorsResponse>('articles/authors', filters as Record<string, string | undefined>),

  get: (id: string) =>
    apiClient.get<Article>('articles/get', { id }),

  create: (payload: CreateArticlePayload) =>
    apiClient.post<Article>('articles/create', payload),

  update: (payload: UpdateArticlePayload) =>
    apiClient.post<Article>('articles/update', payload),

  delete: (id: string) =>
    apiClient.get<{ id: string; deleted: boolean }>('articles/delete', { id }),

  permanentDelete: (id: string) =>
    apiClient.get<{ id: string; deleted: boolean }>('articles/permanent-delete', { id }),
}
