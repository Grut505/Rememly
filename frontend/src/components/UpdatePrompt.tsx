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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <div className="text-center">
          <div className="text-base font-semibold text-gray-900">New version available</div>
          <p className="mt-2 text-sm text-gray-600">
            A newer version of Rememly is ready. Update now to get the latest fixes.
          </p>
        </div>
        <div className="mt-5 flex justify-center">
          <button
            onClick={() => updateServiceWorker(true)}
            className="rounded-md bg-primary-600 px-5 py-2 text-sm font-semibold text-white"
          >
            Update
          </button>
        </div>
      </div>
    </div>
  )
}
