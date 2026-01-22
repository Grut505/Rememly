import { useState, useEffect } from 'react'
import { apiClient } from '../api/client'

// In-memory cache for loaded images (persists across component remounts)
const imageCache = new Map<string, string>()

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
    if (!driveUrl) {
      setSrc('')
      setIsLoading(false)
      setError(false)
      return
    }

    // If already a data URL or blob URL, use it directly
    if (driveUrl.startsWith('data:') || driveUrl.startsWith('blob:')) {
      setSrc(driveUrl)
      setIsLoading(false)
      setError(false)
      return
    }

    const finalFileId = fileId || extractFileId(driveUrl)

    if (!finalFileId) {
      setError(true)
      setIsLoading(false)
      return
    }

    // Check cache first
    const cached = imageCache.get(finalFileId)
    if (cached) {
      setSrc(cached)
      setIsLoading(false)
      setError(false)
      return
    }

    // Fetch via backend
    setIsLoading(true)
    setError(false)

    const fetchImage = async () => {
      try {
        const response = await apiClient.get<{ base64: string }>('image/fetch', { fileId: finalFileId })

        if (!response.base64) {
          setError(true)
          setIsLoading(false)
          return
        }

        const dataUrl = `data:image/jpeg;base64,${response.base64}`
        imageCache.set(finalFileId, dataUrl) // Cache the result
        setSrc(dataUrl)
        setIsLoading(false)
      } catch (err) {
        setError(true)
        setIsLoading(false)
      }
    }

    fetchImage()
  }, [driveUrl, fileId])

  return { src, isLoading, error }
}
