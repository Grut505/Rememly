import { useEffect, useRef, useState } from 'react'

function isPwaStandalone() {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

function isIOS() {
  if (typeof window === 'undefined') return false
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent)
}

function isLandscape() {
  if (typeof window === 'undefined') return false
  if (window.matchMedia) {
    return window.matchMedia('(orientation: landscape)').matches
  }
  return window.innerWidth > window.innerHeight
}

export function OrientationLockOverlay() {
  const [show, setShow] = useState(false)
  const hasReloadedRef = useRef(false)

  useEffect(() => {
    const update = () => {
      const landscape = isPwaStandalone() && isLandscape()
      if (landscape && isIOS() && !hasReloadedRef.current) {
        hasReloadedRef.current = true
        window.location.reload()
        return
      }
      setShow(landscape)
    }

    update()

    const media = window.matchMedia('(orientation: landscape)')
    if (media.addEventListener) {
      media.addEventListener('change', update)
    } else {
      media.addListener(update)
    }
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)

    return () => {
      if (media.removeEventListener) {
        media.removeEventListener('change', update)
      } else {
        media.removeListener(update)
      }
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  useEffect(() => {
    if (show) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
  }, [show])

  if (!show) return null

  return (
    <div className="fixed inset-0 z-[60] bg-primary-600/95 text-white flex items-center justify-center p-6 text-center">
      <div className="max-w-xs">
        <div className="text-2xl font-semibold mb-3">Mode paysage non supporté</div>
        <div className="text-sm text-primary-100">
          Tourne ton écran en mode portrait pour continuer.
        </div>
      </div>
    </div>
  )
}
