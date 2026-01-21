import { useState, useEffect } from 'react'
import { FamileoPost, famileoApi } from '../../api/famileo'
import { formatDateTimeFull } from '../../utils/date'

interface FamileoPostCardProps {
  post: FamileoPost
  selected: boolean
  onSelectionChange: (selected: boolean) => void
  onImageLoaded: (postId: number, base64: string, mimeType: string) => void
  cachedImage?: { base64: string; mimeType: string }
  alreadyImported?: boolean
}

export function FamileoPostCard({ post, selected, onSelectionChange, onImageLoaded, cachedImage, alreadyImported }: FamileoPostCardProps) {
  const [imageLoading, setImageLoading] = useState(false)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [imageError, setImageError] = useState(false)

  // Auto-load image on mount
  useEffect(() => {
    if (cachedImage) {
      setImageSrc(`data:${cachedImage.mimeType};base64,${cachedImage.base64}`)
      return
    }

    const loadImage = async () => {
      if (imageSrc || imageLoading || imageError) return

      setImageLoading(true)
      try {
        const response = await famileoApi.image(post.image_url)
        setImageSrc(`data:${response.mimeType};base64,${response.base64}`)
        onImageLoaded(post.id, response.base64, response.mimeType)
      } catch (err) {
        setImageError(true)
      } finally {
        setImageLoading(false)
      }
    }

    loadImage()
  }, [post.id, post.image_url, cachedImage])

  // Get initials for avatar from pseudo
  const initials = post.author_pseudo
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2)

  return (
    <div className="px-4">
      <div
        className={`bg-white rounded-lg shadow-md overflow-hidden border-2 transition-colors ${
          selected ? 'border-primary-500 bg-primary-50' : 'border-gray-200'
        }`}
      >
        {/* Header: Checkbox, Author, Date, Imported badge */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Checkbox */}
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onSelectionChange(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 flex-shrink-0"
            />
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-semibold text-orange-700">{initials}</span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-gray-900">{post.author_pseudo}</span>
              <span className="text-sm text-gray-500">
                {formatDateTimeFull(post.date)}
              </span>
            </div>
          </div>
          {/* Already imported badge */}
          {alreadyImported && (
            <div className="flex-shrink-0 ml-2">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Importé
              </span>
            </div>
          )}
        </div>

        {/* Image */}
        <div className="w-full bg-gray-100 relative min-h-[200px]">
          {imageLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
            </div>
          )}
          {imageError && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-500">
              <p className="text-sm">Failed to load image</p>
            </div>
          )}
          {imageSrc && (
            <img
              src={imageSrc}
              alt=""
              className="w-full h-auto object-contain"
            />
          )}
        </div>

        {/* Text Content */}
        {post.text && (
          <div className="p-4">
            <p className="text-gray-900 whitespace-pre-wrap">{post.text}</p>
          </div>
        )}

        {/* Footer with metadata */}
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
          <span>ID: {post.id}</span>
          <span className="mx-2">|</span>
          <span>{post.image_orientation}</span>
        </div>
      </div>
    </div>
  )
}
