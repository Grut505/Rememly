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
  variant?: 'card' | 'row' | 'mosaic'
}

export function FamileoPostCard({ post, selected, onSelectionChange, onImageLoaded, cachedImage, alreadyImported, variant = 'card' }: FamileoPostCardProps) {
  const [imageLoading, setImageLoading] = useState(false)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [imageError, setImageError] = useState(false)
  const isMosaic = variant === 'mosaic'
  const isRow = variant === 'row'

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

  if (isRow) {
    return (
      <div className="px-4">
        <div
          className={`bg-white rounded-lg border shadow-sm px-3 py-2 flex items-center gap-3 transition-colors ${
            selected ? 'border-primary-500 bg-primary-50' : 'border-gray-200'
          }`}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelectionChange(e.target.checked)}
            className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 flex-shrink-0"
          />
          <div className="w-12 h-12 rounded-lg bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center flex-shrink-0">
            {imageLoading && !imageError && (
              <div className="w-5 h-5 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
            )}
            {imageError ? (
              <span className="text-[10px] text-gray-400">No image</span>
            ) : (
              imageSrc && (
                <img src={imageSrc} alt="" className="w-full h-full object-cover" />
              )
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 text-sm">{post.author_pseudo}</span>
              {alreadyImported && (
                <span className="text-[10px] uppercase tracking-wide bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  Imported
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500">{formatDateTimeFull(post.date)}</div>
            {post.text && (
              <div className="text-xs text-gray-700 mt-1 truncate">
                {post.text}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={isMosaic ? '' : 'px-4'}>
      <div
        className={`bg-white rounded-lg ${isMosaic ? 'shadow-sm' : 'shadow-md'} overflow-hidden border-2 transition-colors ${
          selected ? 'border-primary-500 bg-primary-50' : 'border-gray-200'
        }`}
      >
        {isMosaic ? (
          <div className="p-3 pb-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">{post.author_pseudo}</div>
                <div className="text-[11px] text-gray-500">{formatDateTimeFull(post.date)}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {alreadyImported && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Imported
                  </span>
                )}
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(e) => onSelectionChange(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <div className="flex items-center gap-3 flex-1 min-w-0">
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
            {alreadyImported && (
              <div className="flex-shrink-0 ml-2">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Imported
                </span>
              </div>
            )}
          </div>
        )}

        {/* Image */}
        <div
          className={`w-full bg-gray-100 relative ${isMosaic ? 'aspect-[4/3]' : 'min-h-[200px]'}`}
        >
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
              className={`w-full ${isMosaic ? 'h-full object-cover' : 'h-auto object-contain'}`}
            />
          )}
        </div>

        {/* Text Content */}
        {post.text && (
          <div className={isMosaic ? 'px-3 pb-3' : 'p-4'}>
            <p className={`text-gray-900 ${isMosaic ? 'text-xs max-h-12 overflow-hidden' : 'whitespace-pre-wrap'}`}>
              {post.text}
            </p>
          </div>
        )}

        {/* Footer with metadata */}
        {!isMosaic && (
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
            <span>ID: {post.id}</span>
            <span className="mx-2">|</span>
            <span>{post.image_orientation}</span>
          </div>
        )}
      </div>
    </div>
  )
}
