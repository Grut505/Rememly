import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { useUiStore } from '../state/uiStore'

export function UnsavedChangesGuard() {
  const navigate = useNavigate()
  const hasUnsavedChanges = useUiStore((state) => state.hasUnsavedChanges)
  const setUnsavedChanges = useUiStore((state) => state.setUnsavedChanges)
  const pendingPath = useUiStore((state) => state.pendingNavigationPath)
  const setPendingPath = useUiStore((state) => state.setPendingNavigationPath)
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    if (!pendingPath) return
    if (hasUnsavedChanges) {
      setShowConfirm(true)
    } else {
      navigate(pendingPath)
      setPendingPath(null)
    }
  }, [pendingPath, hasUnsavedChanges, navigate, setPendingPath])

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsavedChanges])

  return (
    <ConfirmDialog
      isOpen={showConfirm}
      title="Discard changes?"
      message="You have unsaved changes. Are you sure you want to leave?"
      confirmLabel="Discard"
      cancelLabel="Stay"
      onConfirm={() => {
        setShowConfirm(false)
        const nextPath = pendingPath
        setUnsavedChanges(false)
        setPendingPath(null)
        if (nextPath) {
          navigate(nextPath)
        }
      }}
      onCancel={() => {
        setShowConfirm(false)
        setPendingPath(null)
      }}
      variant="danger"
    />
  )
}
