import { Article } from '../../api/types'
import { formatDateShort } from '../../utils/date'

// Convert old Drive URLs to new embeddable format
function convertDriveUrl(url: string): string {
  if (!url) return url

  // Extract file ID from various Drive URL formats
  const patterns = [
    /drive\.google\.com\/file\/d\/([^\/]+)/,
    /drive\.google\.com\/uc\?.*[&?]id=([^&]+)/,
    /drive\.google\.com\/open\?.*[&?]id=([^&]+)/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match && match[1]) {
      return `https://lh3.googleusercontent.com/d/${match[1]}`
    }
  }

  // If already in lh3 format or not a Drive URL, return as-is
  return url
}

interface ArticleCardProps {
  article: Article
  onClick: () => void
}

export function ArticleCard({ article, onClick }: ArticleCardProps) {
  return (
    <div
      onClick={onClick}
      className="bg-white border-b border-gray-200 cursor-pointer active:bg-gray-50 touch-manipulation"
    >
      {/* Image */}
      <div className="w-full">
        <img
          src={convertDriveUrl(article.image_url)}
          alt=""
          className="w-full h-auto object-contain"
          loading="lazy"
        />
      </div>

      {/* Content */}
      <div className="p-4">
        {article.texte && (
          <p className="text-gray-900 mb-2 whitespace-pre-wrap">
            {article.texte}
          </p>
        )}

        {/* Meta */}
        <div className="text-sm text-gray-500">
          {article.auteur} · {formatDateShort(article.date_modification)}
        </div>
      </div>
    </div>
  )
}
