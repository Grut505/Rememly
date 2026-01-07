import { create } from 'zustand'

interface UiState {
  toast: {
    message: string
    type: 'success' | 'error' | 'info'
  } | null
  showToast: (message: string, type: 'success' | 'error' | 'info') => void
  hideToast: () => void
}

export const useUiStore = create<UiState>((set) => ({
  toast: null,

  showToast: (message, type) => {
    set({ toast: { message, type } })
    setTimeout(() => set({ toast: null }), 3000)
  },

  hideToast: () => set({ toast: null }),
}))
