import { apiClient } from './client'

export interface ConfigValue {
  key: string
  value: string | null
}

export interface ConfigLinks {
  spreadsheet_id: string
  spreadsheet_url: string
}

export const configApi = {
  get: (key: string) =>
    apiClient.get<ConfigValue>('config/get', { key }),

  set: (key: string, value: string) =>
    apiClient.post<ConfigValue>('config/set', { key, value }),

  links: () =>
    apiClient.get<ConfigLinks>('config/links'),
}
