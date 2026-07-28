import { useCallback, useRef, useState } from 'react'

const PULL_THRESHOLD = 70
const PULL_START_THRESHOLD = 14
const PULL_MAX = 120

function getScrollTop() {
  return document.scrollingElement?.scrollTop ?? window.scrollY
}

interface UsePullToRefreshOptions {
  onRefresh: () => void
  isRefreshing: boolean
  disabled?: boolean
}

export function usePullToRefresh({ onRefresh, isRefreshing, disabled = false }: UsePullToRefreshOptions) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isPulling, setIsPulling] = useState(false)
  const touchStartYRef = useRef<number | null>(null)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (getScrollTop() <= 0 && !isRefreshing && !disabled) {
      touchStartYRef.current = e.touches[0].clientY
      setIsPulling(false)
    }
  }, [isRefreshing, disabled])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (isRefreshing || disabled) return
    if (getScrollTop() > 0) {
      setPullDistance(0)
      setIsPulling(false)
      touchStartYRef.current = null
      return
    }
    if (touchStartYRef.current === null) {
      touchStartYRef.current = e.touches[0].clientY
    }
    const delta = e.touches[0].clientY - touchStartYRef.current
    if (delta <= PULL_START_THRESHOLD) {
      setPullDistance(0)
      setIsPulling(false)
      return
    }
    const adjusted = delta - PULL_START_THRESHOLD
    const rubberBand = (PULL_MAX * adjusted) / (adjusted + PULL_MAX)
    setPullDistance(Math.min(PULL_START_THRESHOLD + rubberBand, PULL_MAX))
    setIsPulling(true)
  }, [isRefreshing, disabled])

  const onTouchEnd = useCallback(() => {
    if (pullDistance >= PULL_THRESHOLD && !isRefreshing && !disabled) {
      onRefresh()
    }
    setPullDistance(0)
    setIsPulling(false)
    touchStartYRef.current = null
  }, [pullDistance, isRefreshing, disabled, onRefresh])

  return {
    pullDistance,
    isPulling,
    pullThreshold: PULL_THRESHOLD,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  }
}
