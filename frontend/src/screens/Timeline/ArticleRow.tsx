import { useState } from 'react'
import { Article } from '../../api/types'
import { useNavigate } from 'react-router-dom'
import { formatDateTimeFull } from '../../utils/date'
import { useImageLoader } from '../../hooks/useImageLoader'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { articlesService } from '../../services/articles.service'

interface ArticleRowProps {
  article: Article
  isDuplicate?: boolean
  onDeleted?: (id: string) => void
  onRestored?: (id: string) => void
  selectionMode?: boolean
  selected?: boolean
  onSelectionChange?: (id: string, selected: boolean) => void
}

export function ArticleRow({ article, isDuplicate, onDeleted, onRestored, selectionMode, selected, onSelectionChange }: ArticleRowProps) {
  const navigate = useNavigate()
  const { src: imageSrc, isLoading: imageLoading, error: imageError } = useImageLoader(article.image_url, article.image_file_id)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)

  const isDeleted = article.status === 'DELETED'
  const isDraft = article.status === 'DRAFT'
  const displayName = article.author_pseudo || 'Unknown'

  const handleRowClick = () => {
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
    <div className="px-4 mb-3">
      <div
        className={`bg-white rounded-lg border shadow-sm px-3 py-2 flex items-center gap-3 max-w-2xl mx-auto ${
          isDeleted ? 'border-red-300' : selected ? 'border-primary-500 ring-2 ring-primary-200' : 'border-gray-200'
        }`}
        onClick={handleRowClick}
      >
        {selectionMode && (
          <input
            type="checkbox"
            checked={selected}
            onChange={handleCheckboxChange}
            onClick={(e) => e.stopPropagation()}
            className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 flex-shrink-0"
          />
        )}
        <div className="w-12 h-12 rounded-lg bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center flex-shrink-0">
          {imageLoading && !imageError && (
            <div className="w-5 h-5 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
          )}
          {imageError ? (
            <span className="text-xs text-gray-400">No image</span>
          ) : (
            imageSrc && (
              <img src={imageSrc} alt="" className="w-full h-full object-cover" loading="lazy" />
            )
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 text-sm">{displayName}</span>
            {!article.famileo_post_id && (
              <span className="text-[10px] uppercase tracking-wide bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                Local
              </span>
            )}
            {article.famileo_post_id && (
              <span className="text-[10px] uppercase tracking-wide bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                Famileo
              </span>
            )}
            {isDuplicate && (
              <span className="text-[10px] uppercase tracking-wide bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                Duplicate
              </span>
            )}
            {isDraft && (
              <span className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                Draft
              </span>
            )}
            {isDeleted && (
              <span className="text-[10px] uppercase tracking-wide bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                Deleted
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500">{formatDateTimeFull(article.date)}</div>
          {article.texte && (
            <div className="text-sm text-gray-700 mt-1 truncate">
              {article.texte}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleEdit}
            className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0 touch-manipulation"
            aria-label="Edit article"
          >
            <svg className="w-4 h-4" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
            </svg>
          </button>
          {isDeleted ? (
            <button
              onClick={handleRestoreClick}
              className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors flex-shrink-0 touch-manipulation"
              aria-label="Restore article"
            >
              <svg className="w-4 h-4" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
              </svg>
            </button>
          ) : (
            <button
              onClick={handleDeleteClick}
              className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0 touch-manipulation"
              aria-label="Delete article"
            >
              <svg className="w-4 h-4" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
              </svg>
            </button>
          )}
        </div>
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
    </div>
  )
}
