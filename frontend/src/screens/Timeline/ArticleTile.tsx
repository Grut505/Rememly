import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Article } from '../../api/types'
import { formatDateTimeFull } from '../../utils/date'
import { useImageLoader } from '../../hooks/useImageLoader'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { FamileoPosterModal } from '../../ui/FamileoPosterModal'
import { articlesService } from '../../services/articles.service'

interface ArticleTileProps {
  article: Article
  isDuplicate?: boolean
  onDeleted?: (id: string) => void
  onRestored?: (id: string) => void
  selectionMode?: boolean
  selected?: boolean
  onSelectionChange?: (id: string, selected: boolean) => void
}

export function ArticleTile({ article, isDuplicate, onDeleted, onRestored, selectionMode, selected, onSelectionChange }: ArticleTileProps) {
  const navigate = useNavigate()
  const { src: imageSrc, isLoading: imageLoading, error: imageError } = useImageLoader(article.image_url, article.image_file_id)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [showFamileoPoster, setShowFamileoPoster] = useState(false)

  const isDeleted = article.status === 'DELETED'
  const isDraft = article.status === 'DRAFT'
  const displayName = article.author_pseudo || 'Unknown'

  const handleTileClick = () => {
    if (selectionMode) {
      onSelectionChange?.(article.id, !selected)
    }
  }

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation()
    onSelectionChange?.(article.id, e.target.checked)
  }

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
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

  const handleRestoreClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowRestoreConfirm(true)
  }

  const handleFamileoPosterClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowFamileoPoster(true)
  }

  const handleConfirmRestore = async () => {
    setIsRestoring(true)
    try {
      await articlesService.restoreArticle(article.id)
      setShowRestoreConfirm(false)
      onRestored?.(article.id)
    } catch (err) {
      console.error('Failed to restore article:', err)
    } finally {
      setIsRestoring(false)
    }
  }

  return (
    <div
      className={`bg-white rounded-lg shadow-sm overflow-hidden border transition-shadow hover:shadow-md relative ${
        isDeleted ? 'border-red-300' : selected ? 'border-primary-500 ring-2 ring-primary-200' : 'border-gray-200'
      }`}
      onClick={handleTileClick}
    >
      <div className="flex min-h-[18px]">
        {!article.famileo_post_id && (
          <div className="flex-1 bg-green-500 text-white text-[10px] font-semibold px-2 py-0.5 text-center">
            Local
          </div>
        )}
        {article.famileo_post_id && (
          <div className="flex-1 bg-purple-500 text-white text-[10px] font-semibold px-2 py-0.5 text-center">
            Famileo
          </div>
        )}
        {isDuplicate && (
          <div className="flex-1 bg-yellow-500 text-white text-[10px] font-semibold px-2 py-0.5 text-center">
            Duplicate
          </div>
        )}
        {isDraft && (
          <div className="flex-1 bg-amber-500 text-white text-[10px] font-semibold px-2 py-0.5 text-center">
            Draft
          </div>
        )}
        {isDeleted && (
          <div className="flex-1 bg-red-500 text-white text-[10px] font-semibold px-2 py-0.5 text-center">
            Deleted
          </div>
        )}
      </div>
      <div className="absolute top-8 left-2 z-10">
        {selectionMode && (
          <input
            type="checkbox"
            checked={selected}
            onChange={handleCheckboxChange}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
        )}
      </div>
      <div className="absolute top-8 right-2 z-10 flex items-center gap-1">
        {!article.famileo_post_id && (
          <button
            onClick={handleFamileoPosterClick}
            className="p-1.5 bg-white/90 text-gray-600 hover:text-purple-600 hover:bg-white rounded-md transition-colors"
            aria-label="Poster vers Famileo"
          >
            <svg className="w-4 h-4" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M22 2L11 13"></path>
              <path d="M22 2l-7 20-4-9-9-4 20-7z"></path>
            </svg>
          </button>
        )}
        <button
          onClick={handleEdit}
          className="p-1.5 bg-white/90 text-gray-600 hover:text-primary-600 hover:bg-white rounded-md transition-colors"
          aria-label="Edit article"
        >
          <svg className="w-4 h-4" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
            <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
          </svg>
        </button>
        {isDeleted ? (
          <button
            onClick={handleRestoreClick}
            className="p-1.5 bg-white/90 text-gray-600 hover:text-green-600 hover:bg-white rounded-md transition-colors"
            aria-label="Restore article"
          >
            <svg className="w-4 h-4" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
          </button>
        ) : (
          <button
            onClick={handleDeleteClick}
            className="p-1.5 bg-white/90 text-gray-600 hover:text-red-600 hover:bg-white rounded-md transition-colors"
            aria-label="Delete article"
          >
            <svg className="w-4 h-4" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
          </button>
        )}
      </div>
      <div
        className="w-full bg-gray-50 relative overflow-hidden"
        style={{ aspectRatio: '4 / 3' }}
      >
        {imageLoading && !imageError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
          </div>
        )}
        {imageError ? (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-xs">
            No image
          </div>
        ) : (
          imageSrc && (
            <img src={imageSrc} alt="" className="w-full h-full object-cover" loading="lazy" />
          )
        )}
      </div>
      <div className="p-3">
        <div className="text-sm font-semibold text-gray-900">{displayName}</div>
        <div className="text-xs text-gray-500">{formatDateTimeFull(article.date)}</div>
        {article.texte && (
          <div className="text-xs text-gray-700 mt-2 max-h-12 overflow-hidden">
            {article.texte}
          </div>
        )}
      </div>

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

      <ConfirmDialog
        isOpen={showRestoreConfirm}
        title="Restore article?"
        message="The article will be restored and visible again in your timeline."
        confirmLabel="Restore"
        cancelLabel="Cancel"
        onConfirm={handleConfirmRestore}
        onCancel={() => setShowRestoreConfirm(false)}
        isLoading={isRestoring}
      />

      <FamileoPosterModal
        isOpen={showFamileoPoster}
        onClose={() => setShowFamileoPoster(false)}
        authorLabel={displayName}
        authorEmail={article.auteur}
        dateLabel={formatDateTimeFull(article.date)}
        excerpt={article.texte}
        text={article.texte}
        publishedAt={article.date}
        imageUrl={article.image_url}
        imageFileId={article.image_file_id}
      />
    </div>
  )
}
