import { createPortal } from 'react-dom'
import { Button } from './Button'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  variant?: 'danger' | 'primary'
  isLoading?: boolean
  progress?: { current: number; total: number } | null
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'primary',
  isLoading = false,
  progress = null,
}: ConfirmDialogProps) {
  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={(e) => {
          e.stopPropagation()
          onCancel()
        }}
      />

      {/* Dialog */}
      <div
        className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold mb-2">{title}</h2>
        <p className="text-gray-600 mb-4">{message}</p>

        {/* Progress bar */}
        {progress && (
          <div className="mb-6">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Deleting...</span>
              <span>{progress.current} / {progress.total}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-red-600 h-2.5 rounded-full transition-all duration-200"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {!progress && <div className="mb-2" />}

        <div className="flex gap-3">
          <Button
            variant="secondary"
            fullWidth
            onClick={(e) => {
              e.stopPropagation()
              onCancel()
            }}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant}
            fullWidth
            onClick={(e) => {
              e.stopPropagation()
              onConfirm()
            }}
            disabled={isLoading}
          >
            {isLoading ? 'Deleting...' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
