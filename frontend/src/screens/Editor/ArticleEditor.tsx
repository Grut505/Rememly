import { useState, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { articlesService } from '../../services/articles.service'
import { storageService } from '../../services/storage.service'
import { articlesApi } from '../../api/articles'
import { useArticlesStore } from '../../state/articlesStore'
import { useUiStore } from '../../state/uiStore'
import { Button } from '../../ui/Button'
import { LoadingScreen } from '../../ui/Spinner'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { PhotoPicker } from './PhotoPicker'
import { TextInput } from './TextInput'
import { DateTimeInput } from './DateTimeInput'
import { ArticleStatus } from '../../api/types'

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
  const { updateArticle: updateArticleInStore, deleteArticle: deleteArticleFromStore } = useArticlesStore()
  const { showToast } = useUiStore()

  const [texte, setTexte] = useState('')
  const [dateModification, setDateModification] = useState(new Date().toISOString())
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [articleStatus, setArticleStatus] = useState<ArticleStatus>('ACTIVE')

  const isEditMode = !!id
  const isDeleted = articleStatus === 'DELETED'

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

  const loadArticle = async () => {
    if (!id) return

    setIsLoading(true)
    try {
      const article = await articlesApi.get(id)
      setTexte(article.texte)
      setDateModification(article.date)
      setPreviewUrl(article.image_url)
      setArticleStatus(article.status || 'ACTIVE')
    } catch (error) {
      showToast('Failed to load article', 'error')
      navigate('/')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePhotoSelected = (file: File) => {
    setPhotoFile(file)
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
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
        const newStatus = isDeleted ? 'ACTIVE' : undefined
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
          dateModification
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
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <button
          onClick={handleCancel}
          className="text-gray-600 touch-manipulation"
          disabled={isSaving}
        >
          ← Back
        </button>
        <h1 className="text-lg font-semibold">
          {isEditMode ? 'Edit Article' : 'New Article'}
        </h1>
        <div className="w-12" />
      </header>

      {/* Content */}
      <div className="flex-1 p-4 space-y-6 pb-32">
        <PhotoPicker
          onPhotoSelected={handlePhotoSelected}
          currentImage={previewUrl}
        />

        <TextInput value={texte} onChange={setTexte} />

        <DateTimeInput value={dateModification} onChange={setDateModification} />
      </div>

      {/* Actions */}
      <div className="bg-white border-t border-gray-200 p-4 space-y-2 sticky bottom-0">
        <Button
          onClick={handleSave}
          disabled={isSaving || (!photoFile && !isEditMode)}
          fullWidth
        >
          {isSaving ? 'Saving...' : isDeleted ? 'Save and restore' : isEditMode ? 'Update' : 'Create'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => navigate('/photo-assembly', { state: { editMode: isEditMode, articleId: id, texte, dateModification } })}
          disabled={isSaving}
          fullWidth
        >
          Use Photo Assembly
        </Button>
        {isEditMode && !isDeleted && (
          <Button
            variant="danger"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isSaving}
            fullWidth
          >
            Delete Article
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={handleCancel}
          disabled={isSaving}
          fullWidth
        >
          Cancel
        </Button>
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
    </div>
  )
}
