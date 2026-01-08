import { Article } from '../../api/types'
import { formatDateTimeFull } from '../../utils/date'
import { useNavigate } from 'react-router-dom'
import { useProfile } from '../../contexts/ProfileContext'
import { useAuth } from '../../auth/AuthContext'
import { useState } from 'react'

// Convert old Drive URLs to uc?export=view format (avoids 429 rate limiting)
function convertDriveUrl(url: string): string {
  if (!url) {
    console.warn('Empty image URL provided')
    return ''
  }

  // If already in uc?export=view format, return as-is
  if (url.includes('drive.google.com/uc?') && url.includes('export=view')) {
    return url
  }

  // Extract file ID from various Drive URL formats
  const patterns = [
    /drive\.google\.com\/file\/d\/([^\/]+)/,
    /drive\.google\.com\/uc\?.*[&?]id=([^&]+)/,
    /drive\.google\.com\/open\?.*[&?]id=([^&]+)/,
    /drive\.google\.com\/thumbnail\?id=([^&]+)/,
    /lh3\.googleusercontent\.com\/d\/([^?&=]+)/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match && match[1]) {
      return `https://drive.google.com/uc?export=view&id=${match[1]}`
    }
  }

  // If not a Drive URL, return as-is (could be data URL or other format)
  return url
}

function getAvatarOrInitials(author: string, avatarUrl?: string): JSX.Element {
  if (avatarUrl) {
    return (
      <img
        src={convertDriveUrl(avatarUrl)}
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
}

export function ArticleCard({ article }: ArticleCardProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { profile } = useProfile()
  const [imageLoading, setImageLoading] = useState(true)

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigate(`/editor/${article.id}`)
  }

  const handleCardClick = () => {
    navigate(`/editor/${article.id}`)
  }

  // Use profile pseudo if article author matches current user name
  const displayName = user?.name === article.auteur
    ? (profile?.pseudo || article.auteur)
    : article.auteur

  const displayAvatar = user?.name === article.auteur
    ? profile?.avatar_url
    : undefined

  return (
    <div className="px-4 mb-4">
      <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow max-w-2xl mx-auto relative z-0">
        {/* Header: Avatar, Author, Date, Edit button */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {getAvatarOrInitials(displayName, displayAvatar)}
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-gray-900">{displayName}</span>
              <span className="text-sm text-gray-500">
                {formatDateTimeFull(article.date_modification)}
              </span>
            </div>
          </div>
          <button
            onClick={handleEdit}
            className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0 touch-manipulation"
            aria-label="Edit article"
          >
            <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
            </svg>
          </button>
        </div>

        {/* Image */}
        <div
          onClick={handleCardClick}
          className="w-full cursor-pointer bg-gray-50 relative"
        >
          {imageLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
            </div>
          )}
          <img
            src={convertDriveUrl(article.image_url)}
            alt=""
            className={`w-full h-auto object-contain ${imageLoading ? 'opacity-0' : 'opacity-100'} transition-opacity`}
            loading="lazy"
            onLoad={() => setImageLoading(false)}
            onError={(e) => {
              console.error('Image failed to load:', article.image_url)
              setImageLoading(false)
            }}
          />
        </div>

        {/* Text Content */}
        {article.texte && (
          <div
            onClick={handleCardClick}
            className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
          >
            <p className="text-gray-900 whitespace-pre-wrap">{article.texte}</p>
          </div>
        )}
      </div>
    </div>
  )
}
