import { Article } from '../../api/types'
import { formatDateShort } from '../../utils/date'

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
          src={article.image_url}
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
