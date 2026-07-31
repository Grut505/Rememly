import { apiClient, ApiError } from './client'

export interface ConfigValue {
  key: string
  value: string | null
}

export const configApi = {
  // A config key that has never been saved (e.g. a setting added after the
  // user last opened Settings) is a completely normal, expected case - the
  // backend correctly reports it as a 404/NOT_FOUND, but every caller here
  // reads several keys via Promise.all, and a single rejection there fails
  // the WHOLE batch, silently discarding every other already-loaded value
  // and falling back to hardcoded defaults across the entire form (looked
  // like the whole Settings/Blurb config had been wiped, every time a new
  // setting was introduced). Treat NOT_FOUND as "no value yet" instead of
  // an error - any other failure (auth, network, server) still rejects.
  get: async (key: string): Promise<ConfigValue> => {
    try {
      return await apiClient.get<ConfigValue>('config/get', { key })
    } catch (error) {
      if (error instanceof ApiError && error.code === 'NOT_FOUND') {
        return { key, value: null }
      }
      throw error
    }
  },

  set: (key: string, value: string) =>
    apiClient.post<ConfigValue>('config/set', { key, value }),
}
