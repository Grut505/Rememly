import { useState } from 'react'
import { Article } from '../../api/types'
import { formatDateTimeFull } from '../../utils/date'
import { useNavigate } from 'react-router-dom'
import { useProfile } from '../../contexts/ProfileContext'
import { useAuth } from '../../auth/AuthContext'
import { useImageLoader } from '../../hooks/useImageLoader'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { articlesService } from '../../services/articles.service'

// Convert Drive URLs to thumbnail format
function convertDriveUrl(url: string): string {
  if (!url) {
    return ''
  }

  // If already in thumbnail format, return as-is
  if (url.includes('drive.google.com/thumbnail')) {
    return url
  }

  // Extract file ID from various Drive URL formats and convert to thumbnail
  const patterns = [
    /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/,
    /drive\.google\.com\/uc\?.*id=([A-Za-z0-9_-]+)/,
    /drive\.google\.com\/open\?.*id=([A-Za-z0-9_-]+)/,
    /lh3\.googleusercontent\.com\/d\/([A-Za-z0-9_-]+)/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match && match[1]) {
      return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w200`
    }
  }

  // If not a Drive URL, return as-is (could be data URL or other format)
  return url
}

function getAvatarOrInitials(author: string, avatarUrl?: string): JSX.Element {
  if (avatarUrl) {
    // If it's already a blob URL or data URL, use it directly (no conversion needed)
    const finalUrl = (avatarUrl.startsWith('blob:') || avatarUrl.startsWith('data:'))
      ? avatarUrl
      : convertDriveUrl(avatarUrl)
    return (
      <img
        src={finalUrl}
        alt={author}
        className="w-10 h-10 rounded-full object-cover border-2 border-primary-200 flex-shrink-0"
      />
    )
  }

  const initials = author
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2)

  return (
    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
      <span className="text-sm font-semibold text-primary-700">{initials}</span>
    </div>
  )
}

interface ArticleCardProps {
  article: Article
  onDeleted?: (id: string) => void
}

export function ArticleCard({ article, onDeleted }: ArticleCardProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { profile, avatarBlobUrl } = useProfile()
  const { src: imageSrc, isLoading: imageLoading, error: imageError } = useImageLoader(article.image_url, article.image_file_id)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const isDeleted = article.status === 'DELETED'

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigate(`/editor/${article.id}`)
  }

  const handleCardClick = () => {
    navigate(`/editor/${article.id}`)
  }

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowDeleteConfirm(true)
  }

  const handleConfirmDelete = async () => {
    setIsDeleting(true)
    try {
      await articlesService.deleteArticle(article.id)
      setShowDeleteConfirm(false)
      onDeleted?.(article.id)
    } catch (err) {
      console.error('Failed to delete article:', err)
    } finally {
      setIsDeleting(false)
    }
  }

  // Use author_pseudo from backend (enriched with user profile)
  const displayName = article.author_pseudo || 'Unknown'

  // Use cached blob URL for avatar if this is the current user's article
  const isCurrentUser = user?.email === article.auteur
  const displayAvatar = isCurrentUser
    ? avatarBlobUrl || undefined
    : undefined

  return (
    <div className="px-4 mb-4">
      <div className={`bg-white rounded-lg shadow-md overflow-hidden border hover:shadow-lg transition-shadow max-w-2xl mx-auto relative z-0 ${
        isDeleted ? 'border-red-300' : 'border-gray-200'
      }`}>

        {/* Header: Avatar, Author, Date, Edit/Delete buttons */}
        {isDeleted && (
          <div className="bg-red-500 text-white text-xs font-semibold px-2 py-1 text-center">
            Deleted
          </div>
        )}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {getAvatarOrInitials(displayName, displayAvatar)}
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-gray-900">{displayName}</span>
              <span className="text-sm text-gray-500">
                {formatDateTimeFull(article.date)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleEdit}
              className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0 touch-manipulation"
              aria-label="Edit article"
            >
              <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
              </svg>
            </button>
            {!isDeleted && (
              <button
                onClick={handleDeleteClick}
                className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0 touch-manipulation"
                aria-label="Delete article"
              >
                <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                  <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Image */}
        <div
          onClick={handleCardClick}
          className="w-full cursor-pointer bg-gray-50 relative"
        >
          {imageLoading && !imageError && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
            </div>
          )}
          {imageError ? (
            <div className="p-8 text-center text-gray-500">
              <p className="text-sm">Failed to load image</p>
              <p className="text-xs mt-1">FileId: {article.image_file_id}</p>
            </div>
          ) : (
            imageSrc && (
              <img
                src={imageSrc}
                alt=""
                className="w-full h-auto object-contain"
                loading="lazy"
              />
            )
          )}
        </div>

        {/* Text Content */}
        {article.texte && (
          <div
            onClick={handleCardClick}
            className="p-4 transition-colors cursor-pointer hover:bg-gray-50"
          >
            <p className="whitespace-pre-wrap text-gray-900">{article.texte}</p>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete article?"
        message="The article will be marked as deleted. You can find it later by enabling the 'Show deleted' filter."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        variant="danger"
        isLoading={isDeleting}
      />
    </div>
  )
}
