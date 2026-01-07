import { useEffect, useRef, useCallback } from 'react'

interface UseInfiniteScrollOptions {
  onLoadMore: () => void
  hasMore: boolean
  isLoading: boolean
  threshold?: number
}

export function useInfiniteScroll({
  onLoadMore,
  hasMore,
  isLoading,
  threshold = 0.8,
}: UseInfiniteScrollOptions) {
  const observerRef = useRef<IntersectionObserver>()

  const lastElementRef = useCallback(
    (node: HTMLElement | null) => {
      if (isLoading) return
      if (observerRef.current) observerRef.current.disconnect()

      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          onLoadMore()
        }
      })

      if (node) observerRef.current.observe(node)
    },
    [isLoading, hasMore, onLoadMore]
  )

  return { lastElementRef }
}
