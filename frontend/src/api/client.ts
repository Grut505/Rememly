import { ApiResponse } from './types'

const API_BASE_URL = import.meta.env.VITE_APPS_SCRIPT_URL

export class ApiError extends Error {
  code?: string
  details?: string

  constructor(message: string, options?: { code?: string; details?: string }) {
    super(message)
    this.name = 'ApiError'
    this.code = options?.code
    this.details = options?.details
  }
}

class ApiClient {
  private getUserEmail(): string | null {
    const userJson = localStorage.getItem('user')
    if (!userJson) return null
    try {
      const user = JSON.parse(userJson)
      return user.email || null
    } catch {
      return null
    }
  }

  // Prefer the signed session token (Worker backend) over the bare email claim
  // (Apps Script backend, or before the Worker has issued a session yet) - the
  // bare claim can't be verified server-side, the session token can.
  private getAuthCredential(): string | null {
    const userJson = localStorage.getItem('user')
    if (!userJson) return null
    try {
      const user = JSON.parse(userJson)
      if (user.session_token) return `Session ${user.session_token}`
      if (user.email) return `Email ${user.email}`
      return null
    } catch {
      return null
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const credential = this.getAuthCredential()

    // Don't set Content-Type header to avoid CORS preflight
    const headers: HeadersInit = {
      ...(options.headers || {}),
    }

    const authParam = credential ? `&auth=${encodeURIComponent(credential)}` : ''

    try {
      const response = await fetch(`${API_BASE_URL}?path=${endpoint}${authParam}`, {
        ...options,
        headers,
      })

      const data: ApiResponse<T> = await response.json()

      if (!data.ok) {
        const apiError = data.error

        // If authentication error, clear storage and redirect to login
        if (apiError?.code === 'INVALID_TOKEN' || apiError?.code === 'AUTH_REQUIRED' || apiError?.code === 'FORBIDDEN') {
          localStorage.removeItem('user')

          // Store error message for display on login page
          const errorMessage = apiError?.message || 'Your account is not authorized to access this application.'
          localStorage.setItem('auth_error', errorMessage)

          window.location.href = '/auth'
          throw new ApiError(errorMessage, { code: apiError?.code, details: apiError?.details })
        }
        throw new ApiError(apiError?.message || 'An error occurred', {
          code: apiError?.code,
          details: apiError?.details,
        })
      }

      return data.data as T
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error('Network error')
    }
  }

  async get<T>(
    endpoint: string,
    params?: Record<string, string | undefined>,
    options: RequestInit = {}
  ): Promise<T> {
    // Filter out undefined values
    const filteredParams = params
      ? Object.fromEntries(
          Object.entries(params).filter(([_, v]) => v !== undefined)
        ) as Record<string, string>
      : undefined

    const queryString = filteredParams
      ? '&' + new URLSearchParams(filteredParams).toString()
      : ''
    // Use POST for all requests to avoid CORS issues with Apps Script
    return this.request<T>(`${endpoint}${queryString}`, {
      method: 'POST',
      ...options,
    })
  }

  async post<T>(endpoint: string, body?: unknown, options: RequestInit = {}): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
      ...options,
    })
  }

  async put<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  }
}

export const apiClient = new ApiClient()
