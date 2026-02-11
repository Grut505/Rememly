import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { articlesService } from '../../services/articles.service'
import { storageService } from '../../services/storage.service'
import { articlesApi } from '../../api/articles'
import { useArticlesStore } from '../../state/articlesStore'
import { useUiStore } from '../../state/uiStore'
import { Button } from '../../ui/Button'
import { LoadingScreen, Spinner } from '../../ui/Spinner'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { AppHeader } from '../../ui/AppHeader'
import { PhotoPicker } from './PhotoPicker'
import { TextInput } from './TextInput'
import { DateTimeInput } from './DateTimeInput'
import { ArticleStatus } from '../../api/types'
import { useImageLoader } from '../../hooks/useImageLoader'
import { FamileoPosterModal } from '../../ui/FamileoPosterModal'
import { formatDateTimeFull } from '../../utils/date'

interface FamileoImportData {
  text: string
  date: string
  author: string
  imageBase64: string
  imageMimeType: string
}

export function ArticleEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { articles, updateArticle: updateArticleInStore, deleteArticle: deleteArticleFromStore } = useArticlesStore()
  const { showToast } = useUiStore()

  const [texte, setTexte] = useState('')
  const [dateModification, setDateModification] = useState(new Date().toISOString())
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string>('')
  const [articleImageUrl, setArticleImageUrl] = useState<string>('')
  const [articleImageFileId, setArticleImageFileId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showFamileoPoster, setShowFamileoPoster] = useState(false)
  const [articleStatus, setArticleStatus] = useState<ArticleStatus>('DRAFT')
  const contentRef = useRef<HTMLDivElement>(null)

  const isEditMode = !!id
  const isDeleted = articleStatus === 'DELETED'
  const isDraft = articleStatus === 'DRAFT'
  const { src: loadedImageSrc } = useImageLoader(articleImageUrl, articleImageFileId)

  // Check for Famileo import data
  useEffect(() => {
    const state = location.state as { famileoImport?: FamileoImportData } | null
    if (state?.famileoImport) {
      const { text, date, imageBase64, imageMimeType } = state.famileoImport

      // Set text
      setTexte(text)

      // Convert Famileo date format (YYYY-MM-DD HH:mm:ss) to ISO
      const parsedDate = new Date(date.replace(' ', 'T'))
      if (!isNaN(parsedDate.getTime())) {
        setDateModification(parsedDate.toISOString())
      }

      // Convert base64 to File and set preview
      if (imageBase64) {
        const dataUrl = `data:${imageMimeType};base64,${imageBase64}`
        setPreviewUrl(dataUrl)

        // Convert to File object for upload
        fetch(dataUrl)
          .then(res => res.blob())
          .then(blob => {
            const file = new File([blob], 'famileo-import.jpg', { type: imageMimeType })
            setPhotoFile(file)
          })
      }

      // Clear the state to prevent re-import on refresh
      window.history.replaceState({}, document.title)
    }
  }, [location.state])

  useEffect(() => {
    if (isEditMode) {
      loadArticle()
    }
  }, [id])

  useEffect(() => {
    if (isEditMode && !photoFile && loadedImageSrc) {
      setPreviewUrl(loadedImageSrc)
    }
  }, [isEditMode, photoFile, loadedImageSrc])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const previousHeight = document.body.style.height
    document.body.style.overflow = 'hidden'
    document.body.style.height = '100%'
    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.height = previousHeight
    }
  }, [])

  useEffect(() => {
    if (isLoading) return
    requestAnimationFrame(() => {
      contentRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      requestAnimationFrame(() => {
        contentRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      })
    })
  }, [id, isLoading, location.key])

  const loadArticle = async () => {
    if (!id) return

    setIsLoading(true)
    try {
      const cached = articles.find((a) => a.id === id)
      if (cached) {
        setTexte(cached.texte || '')
        setDateModification(cached.date)
        setArticleImageUrl(cached.image_url || '')
        setArticleImageFileId(cached.image_file_id || '')
        setArticleStatus(cached.status || 'ACTIVE')
        return
      }

      const article = await articlesApi.get(id)
      setTexte(article.texte)
      setDateModification(article.date)
      setArticleImageUrl(article.image_url || '')
      setArticleImageFileId(article.image_file_id || '')
      setArticleStatus(article.status || 'ACTIVE')
    } catch (error) {
      showToast('Failed to load article', 'error')
      navigate('/')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePhotoSelected = (file: File, exifDate?: Date) => {
    setPhotoFile(file)
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)

    // If EXIF date was extracted and we're creating a new article, use it
    if (exifDate && !isEditMode) {
      setDateModification(exifDate.toISOString())
    }
  }

  const handleSave = async () => {
    if (!photoFile && !isEditMode) {
      showToast('Please select a photo', 'error')
      return
    }

    if (!user) return

    setIsSaving(true)

    try {
      if (isEditMode && id) {
        // If article is deleted, restore it by setting status to ACTIVE
        const newStatus = isDeleted ? 'ACTIVE' : articleStatus
        const updated = await articlesService.updateArticle(
          id,
          texte,
          photoFile || undefined,
          dateModification,
          undefined, // assemblyState
          undefined, // fullPage
          newStatus
        )
        updateArticleInStore(updated)
        showToast(isDeleted ? 'Article restored' : 'Article updated', 'success')
      } else if (photoFile) {
        await articlesService.createArticle(
          user.email,
          texte,
          photoFile,
          dateModification,
          undefined,
          undefined,
          undefined,
          articleStatus
        )
        showToast('Article created', 'success')
      }

      // Clear draft
      await storageService.deleteDraft(id || 'new')

      navigate('/')
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to save article',
        'error'
      )
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl)
    }
    navigate('/')
  }

  const handleDelete = async () => {
    if (!id) return

    setIsSaving(true)
    try {
      console.log('Deleting article:', id)
      const result = await articlesService.deleteArticle(id)
      console.log('Delete result:', result)
      deleteArticleFromStore(id)
      showToast('Article deleted', 'success')
      navigate('/')
    } catch (error) {
      console.error('Delete error:', error)
      showToast(
        error instanceof Error ? error.message : 'Failed to delete article',
        'error'
      )
    } finally {
      setIsSaving(false)
      setShowDeleteConfirm(false)
    }
  }

  if (isLoading) {
    return <LoadingScreen message="Loading article..." />
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />
      {isSaving && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-lg px-6 py-5 flex items-center gap-3">
            <Spinner />
            <div className="text-sm font-medium text-gray-700">Saving...</div>
          </div>
        </div>
      )}
      <div className="flex-1 flex flex-col max-w-content mx-auto w-full bg-white">
      {/* Sub-header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-center flex-shrink-0 relative">
        <h1 className="text-lg font-semibold">
          {isEditMode ? 'Edit Article' : 'New Article'}
        </h1>
        <button
          type="button"
          onClick={() => setShowFamileoPoster(true)}
          className="absolute right-4 top-1/2 -translate-y-1/2 inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
          aria-label="Poster vers Famileo"
        >
          <svg className="w-4 h-4" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
            <path d="M22 2L11 13"></path>
            <path d="M22 2l-7 20-4-9-9-4 20-7z"></path>
          </svg>
          Famileo
        </button>
      </header>

      {/* Content - scrollable */}
      <div ref={contentRef} className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-6 pb-28 overscroll-contain">
        <DateTimeInput value={dateModification} onChange={setDateModification} />

        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-gray-700">Status</div>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button
              type="button"
              onClick={() => setArticleStatus('ACTIVE')}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                articleStatus === 'ACTIVE'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Published
            </button>
            <button
              type="button"
              onClick={() => setArticleStatus('DRAFT')}
              className={`px-3 py-2 text-sm font-medium border-l border-gray-300 transition-colors ${
                articleStatus === 'DRAFT'
                  ? 'bg-amber-500 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Draft
            </button>
          </div>
        </div>

        <PhotoPicker
          onPhotoSelected={handlePhotoSelected}
          currentImage={previewUrl}
          onPhotoAssembly={() => navigate('/photo-assembly', { state: { editMode: isEditMode, articleId: id, texte, dateModification } })}
        />

        <TextInput value={texte} onChange={setTexte} />
      </div>

      {/* Actions - fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 p-3">
        <div className="max-w-content mx-auto w-full flex gap-2">
          {isEditMode && !isDeleted && (
            <Button
              variant="danger"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isSaving}
              className="flex-1 px-3 py-2 text-sm"
            >
              Delete Article
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={isSaving || (!photoFile && !isEditMode)}
            className="flex-1 px-3 py-2 text-sm"
          >
            {isSaving
              ? 'Saving...'
              : isDeleted
              ? 'Save & restore'
              : isEditMode
              ? (isDraft ? 'Save Draft' : 'Update')
              : (isDraft ? 'Save Draft' : 'Publish')}
          </Button>
          <Button
            variant="secondary"
            onClick={handleCancel}
            disabled={isSaving}
            className="flex-1 px-3 py-2 text-sm"
          >
            Cancel
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Article"
        message="Are you sure you want to delete this article? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={isSaving}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
      <FamileoPosterModal
        isOpen={showFamileoPoster}
        onClose={() => setShowFamileoPoster(false)}
        authorLabel={user?.email || 'Unknown'}
        authorEmail={user?.email || ''}
        dateLabel={formatDateTimeFull(dateModification)}
        excerpt={texte}
        text={texte}
        publishedAt={dateModification}
        imageUrl={articleImageUrl}
        imageFileId={articleImageFileId}
        articleId={id}
      />
      </div>
    </div>
  )
}
