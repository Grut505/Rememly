import { apiClient } from './client'

export interface ConfigValue {
  key: string
  value: string | null
}

export const configApi = {
  get: (key: string) =>
    apiClient.get<ConfigValue>('config/get', { key }),

  set: (key: string, value: string) =>
    apiClient.post<ConfigValue>('config/set', { key, value }),
}
