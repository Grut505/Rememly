export type ArticleStatus = 'ACTIVE' | 'DELETED'

export interface Article {
  id: string
  date: string
  auteur: string
  author_pseudo: string
  texte: string
  image_url: string
  image_file_id: string
  assembly_state?: AssemblyState
  full_page?: boolean
  status?: ArticleStatus
  famileo_post_id?: string
}

export interface AssemblyState {
  template: string
  zones: ZoneState[]
}

export interface ZoneState {
  photoIndex: number
  zoom: number
  x: number
  y: number
  rotation?: number
}

export interface PdfJob {
  job_id: string
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'ERROR'
  progress: number
  progress_message?: string
  pdf_file_id?: string
  pdf_url?: string
  error_message?: string
}

export interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

export interface ListArticlesResponse {
  items: Article[]
  next_cursor: string | null
}

export interface AuthUser {
  email: string
  name: string
}

export interface AuthCheckResponse {
  user: AuthUser
  timezone: string
}
