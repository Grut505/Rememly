import { Article } from '../../api/types'
import { formatDateShort } from '../../utils/date'

// Convert old Drive URLs to new embeddable format
function convertDriveUrl(url: string): string {
  if (!url) return url

  // If already in thumbnail format, return as-is
  if (url.includes('drive.google.com/thumbnail')) {
    return url
  }

  // Extract file ID from various Drive URL formats
  const patterns = [
    /drive\.google\.com\/file\/d\/([^\/]+)/,
    /drive\.google\.com\/uc\?.*[&?]id=([^&]+)/,
    /drive\.google\.com\/open\?.*[&?]id=([^&]+)/,
    /lh3\.googleusercontent\.com\/d\/([^?&]+)/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match && match[1]) {
      return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w2000`
    }
  }

  // If not a Drive URL, return as-is
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
      className="bg-white border-b-4 border-gray-300 mb-4 cursor-pointer active:bg-gray-50 touch-manipulation"
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
