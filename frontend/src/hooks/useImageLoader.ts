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
  const [needsFallback, setNeedsFallback] = useState<boolean>(false)

  useEffect(() => {
    // Reset state when URL changes
    setIsLoading(true)
    setError(false)
    setNeedsFallback(false)

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

    // On standalone PWA mode (iOS), fetch via backend immediately
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
    const fileId = extractFileId(url)
    if (fileId) {
      return `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`
    }
    return url
  }

  const fetchViaBackend = async () => {
    // Use provided fileId or extract from URL
    const finalFileId = fileId || extractFileId(driveUrl)
    console.log('[useImageLoader] Fetching image via backend, fileId:', finalFileId, 'url:', driveUrl)

    if (!finalFileId) {
      console.error('[useImageLoader] Could not extract fileId from URL:', driveUrl)
      setError(true)
      setIsLoading(false)
      return
    }

    try {
      console.log('[useImageLoader] Calling API with fileId:', finalFileId)
      // DEBUG: Show the URL that will be called
      const debugUrl = `${import.meta.env.VITE_APPS_SCRIPT_URL}?path=image/fetch&fileId=${finalFileId}`
      console.log('[useImageLoader] DEBUG URL:', debugUrl)
      alert('DEBUG URL: ' + debugUrl)
      const response = await apiClient.get<{ base64: string }>('image/fetch', { fileId: finalFileId })
      console.log('[useImageLoader] Got response, base64 length:', response.base64?.length)

      if (!response.base64) {
        console.error('[useImageLoader] No base64 in response:', response)
        alert('DEBUG: No base64 in response: ' + JSON.stringify(response))
        setError(true)
        setIsLoading(false)
        return
      }

      const dataUrl = `data:image/jpeg;base64,${response.base64}`
      setSrc(dataUrl)
      setIsLoading(false)
      console.log('[useImageLoader] Image loaded successfully')
    } catch (err) {
      console.error('[useImageLoader] Failed to load image via backend:', err)
      const errorMsg = err instanceof Error ? err.message : String(err)
      alert('DEBUG: API Error: ' + errorMsg)
      setError(true)
      setIsLoading(false)
    }
  }

  // Handle image load error (fallback mechanism)
  const handleImageError = () => {
    if (!isStandalonePWA() && !needsFallback) {
      // Try fetching via backend as fallback
      setNeedsFallback(true)
      setIsLoading(true)
      fetchViaBackend()
    } else {
      setError(true)
      setIsLoading(false)
    }
  }

  return { src, isLoading, error }
}
