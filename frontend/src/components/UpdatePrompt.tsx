import { useRegisterSW } from 'virtual:pwa-register/react'

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered:', r)
      // Check for updates every 30 seconds
      if (r) {
        setInterval(() => {
          r.update()
        }, 30 * 1000)
      }
    },
    onRegisterError(error) {
      console.log('SW registration error', error)
    },
  })

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 bg-primary-600 text-white p-4 rounded-lg shadow-lg flex items-center justify-between">
      <span className="text-sm font-medium">New version available</span>
      <button
        onClick={() => updateServiceWorker(true)}
        className="bg-white text-primary-600 px-4 py-2 rounded-md text-sm font-semibold"
      >
        Update
      </button>
    </div>
  )
}
