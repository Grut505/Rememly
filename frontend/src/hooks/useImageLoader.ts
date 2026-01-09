import { useState, useEffect } from 'react'
import { apiClient } from '../api/client'

// Extract file ID from Google Drive URL
function extractFileId(url: string): string | null {
  if (!url) return null

  const patterns = [
    /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/,
    /drive\.google\.com\/uc\?.*id=([A-Za-z0-9_-]+)/,
    /drive\.google\.com\/open\?.*id=([A-Za-z0-9_-]+)/,
    /drive\.google\.com\/thumbnail\?.*id=([A-Za-z0-9_-]+)/,
    /lh3\.googleusercontent\.com\/d\/([A-Za-z0-9_-]+)/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match && match[1]) {
      return match[1]
    }
  }

  return null
}

// Detect if running in standalone PWA mode (iOS)
function isStandalonePWA(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as any).standalone === true
}

interface UseImageLoaderResult {
  src: string
  isLoading: boolean
  error: boolean
}

export function useImageLoader(driveUrl: string, fileId?: string): UseImageLoaderResult {
  const [src, setSrc] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<boolean>(false)

  useEffect(() => {
    // Reset state when URL changes
    setSrc('')
    setIsLoading(true)
    setError(false)

    if (!driveUrl) {
      setIsLoading(false)
      return
    }

    // If already a data URL, use it directly
    if (driveUrl.startsWith('data:')) {
      setSrc(driveUrl)
      setIsLoading(false)
      return
    }

    // On standalone PWA mode (iOS), fetch via backend
    if (isStandalonePWA()) {
      fetchViaBackend()
    } else {
      // On other browsers (including Safari), use direct URL
      const thumbnailUrl = convertToThumbnail(driveUrl)
      setSrc(thumbnailUrl)
      setIsLoading(false)
    }
  }, [driveUrl, fileId])

  const convertToThumbnail = (url: string): string => {
    const extractedFileId = extractFileId(url)
    if (extractedFileId) {
      return `https://drive.google.com/thumbnail?id=${extractedFileId}&sz=w2000`
    }
    return url
  }

  const fetchViaBackend = async () => {
    const finalFileId = fileId || extractFileId(driveUrl)

    if (!finalFileId) {
      setError(true)
      setIsLoading(false)
      return
    }

    try {
      const response = await apiClient.get<{ base64: string }>('image/fetch', { fileId: finalFileId })

      if (!response.base64) {
        setError(true)
        setIsLoading(false)
        return
      }

      const dataUrl = `data:image/jpeg;base64,${response.base64}`
      setSrc(dataUrl)
      setIsLoading(false)
    } catch (err) {
      setError(true)
      setIsLoading(false)
    }
  }

  return { src, isLoading, error }
}
