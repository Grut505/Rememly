import { apiClient } from './client'

export interface LogsRangeResponse {
  min: string | null
  max: string | null
  count: number
}

export interface LogsClearResponse {
  deleted: number
  remaining: number
}

export interface CleanupPropsResponse {
  deleted: number
  queueRemoved: number
}

export const logsApi = {
  getPdfRange: () =>
    apiClient.get<LogsRangeResponse>('logs/pdf/range'),
  clearPdfRange: (from: string | null, to: string | null) =>
    apiClient.post<LogsClearResponse>('logs/pdf/clear', { from, to }),
  getFamileoRange: () =>
    apiClient.get<LogsRangeResponse>('logs/famileo/range'),
  clearFamileoRange: (from: string | null, to: string | null) =>
    apiClient.post<LogsClearResponse>('logs/famileo/clear', { from, to }),
  cleanupPdfProperties: () =>
    apiClient.post<CleanupPropsResponse>('pdf/cleanup-properties'),
}
