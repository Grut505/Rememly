import { create } from 'zustand'

interface UiState {
  toast: {
    message: string
    type: 'success' | 'error' | 'info'
  } | null
  hasUnsavedChanges: boolean
  pendingNavigationPath: string | null
  showToast: (message: string, type: 'success' | 'error' | 'info') => void
  hideToast: () => void
  setUnsavedChanges: (value: boolean) => void
  setPendingNavigationPath: (path: string | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  toast: null,
  hasUnsavedChanges: false,
  pendingNavigationPath: null,

  showToast: (message, type) => {
    set({ toast: { message, type } })
    setTimeout(() => set({ toast: null }), 3000)
  },

  hideToast: () => set({ toast: null }),
  setUnsavedChanges: (value) => set({ hasUnsavedChanges: value }),
  setPendingNavigationPath: (path) => set({ pendingNavigationPath: path }),
}))
