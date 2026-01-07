import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { articlesService } from '../../services/articles.service'
import { storageService } from '../../services/storage.service'
import { articlesApi } from '../../api/articles'
import { useArticlesStore } from '../../state/articlesStore'
import { useUiStore } from '../../state/uiStore'
import { Button } from '../../ui/Button'
import { LoadingScreen } from '../../ui/Spinner'
import { PhotoPicker } from './PhotoPicker'
import { TextInput } from './TextInput'

export function ArticleEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { updateArticle: updateArticleInStore } = useArticlesStore()
  const { showToast } = useUiStore()

  const [texte, setTexte] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const isEditMode = !!id

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
      setPreviewUrl(article.image_url)
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
        const updated = await articlesService.updateArticle(
          id,
          texte,
          photoFile || undefined
        )
        updateArticleInStore(updated)
        showToast('Article updated', 'success')
      } else if (photoFile) {
        await articlesService.createArticle(user.name, texte, photoFile)
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

  if (isLoading) {
    return <LoadingScreen message="Loading article..." />
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
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
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <PhotoPicker
          onPhotoSelected={handlePhotoSelected}
          currentImage={previewUrl}
        />

        <TextInput value={texte} onChange={setTexte} />
      </div>

      {/* Actions */}
      <div className="bg-white border-t border-gray-200 p-4 space-y-2">
        <Button
          onClick={handleSave}
          disabled={isSaving || (!photoFile && !isEditMode)}
          fullWidth
        >
          {isSaving ? 'Saving...' : isEditMode ? 'Update' : 'Create'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => navigate('/photo-assembly', { state: { editMode: isEditMode, articleId: id, texte } })}
          disabled={isSaving}
          fullWidth
        >
          Use Photo Assembly
        </Button>
        <Button
          variant="secondary"
          onClick={handleCancel}
          disabled={isSaving}
          fullWidth
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
