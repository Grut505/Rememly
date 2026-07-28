import { createPortal } from 'react-dom'
import { useUiStore } from '../state/uiStore'

const TYPE_STYLES: Record<'success' | 'error' | 'info', string> = {
  success: 'bg-green-600',
  error: 'bg-red-600',
  info: 'bg-gray-800',
}

export function Toast() {
  const toast = useUiStore((state) => state.toast)
  const hideToast = useUiStore((state) => state.hideToast)

  if (!toast) return null

  return createPortal(
    <div className="fixed inset-x-0 top-0 z-[2000] flex justify-center px-4 pt-4 app-safe-top pointer-events-none">
      <div
        role="status"
        onClick={hideToast}
        className={`${TYPE_STYLES[toast.type]} text-white text-sm font-medium px-4 py-3 rounded-lg shadow-lg max-w-sm text-center pointer-events-auto touch-manipulation`}
      >
        {toast.message}
      </div>
    </div>,
    document.body
  )
}
