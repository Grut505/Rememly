import { ApiResponse } from './types'

const API_BASE_URL = import.meta.env.VITE_APPS_SCRIPT_URL

class ApiClient {
  private getToken(): string | null {
    return localStorage.getItem('google_id_token')
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken()

    // Don't set Content-Type header to avoid CORS preflight
    const headers: HeadersInit = {
      ...(options.headers || {}),
    }

    // Add token as URL parameter for Apps Script
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : ''

    try {
      const response = await fetch(`${API_BASE_URL}?path=${endpoint}${tokenParam}`, {
        ...options,
        headers,
      })

      const data: ApiResponse<T> = await response.json()

      if (!data.ok) {
        // If authentication error, clear storage and redirect to login
        if (data.error?.code === 'INVALID_TOKEN' || data.error?.code === 'AUTH_REQUIRED') {
          localStorage.removeItem('google_id_token')
          localStorage.removeItem('user')

          // Store error message for display on login page
          const errorMessage = data.error?.message || 'Your account is not authorized to access this application.'
          localStorage.setItem('auth_error', errorMessage)

          window.location.href = '/auth'
          throw new Error(errorMessage)
        }
        throw new Error(data.error?.message || 'An error occurred')
      }

      return data.data as T
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error('Network error')
    }
  }

  async get<T>(endpoint: string, params?: Record<string, string | undefined>): Promise<T> {
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
    })
  }

  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
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
