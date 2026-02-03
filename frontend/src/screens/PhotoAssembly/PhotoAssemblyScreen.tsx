import { useNavigate, useLocation } from 'react-router-dom'
import { PhotoAssembly } from '../../modules/photo-assembly/PhotoAssembly'
import { AppHeader } from '../../ui/AppHeader'
import { useAuth } from '../../auth/AuthContext'
import { articlesService } from '../../services/articles.service'
import { useArticlesStore } from '../../state/articlesStore'
import { useUiStore } from '../../state/uiStore'

export function PhotoAssemblyScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { updateArticle: updateArticleInStore } = useArticlesStore()
  const { showToast } = useUiStore()

  // Get mode and article ID from navigation state
  const editMode = location.state?.editMode || false
  const articleId = location.state?.articleId
  const texte = location.state?.texte || ''
  const dateModification = location.state?.dateModification || new Date().toISOString()

  const handleComplete = async (imageBase64: string, assemblyState: object) => {
    if (!user) return

    try {
      // Convert base64 to File for upload
      const dataUrl = `data:image/jpeg;base64,${imageBase64}`
      const response = await fetch(dataUrl)
      const blob = await response.blob()
      const file = new File([blob], 'assembled.jpg', { type: 'image/jpeg' })

      if (editMode && articleId) {
        // Update existing article
        const updated = await articlesService.updateArticle(
          articleId,
          texte,
          file,
          dateModification,
          assemblyState
        )
        updateArticleInStore(updated)
        showToast('Article updated', 'success')
      } else {
        // Create new article
        await articlesService.createArticle(
          user.email,
          texte,
          file,
          dateModification,
          undefined, // famileoPostId
          assemblyState
        )
        showToast('Article created', 'success')
      }

      navigate('/')
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to save article',
        'error'
      )
    }
  }

  const handleCancel = () => {
    navigate(editMode && articleId ? `/editor/${articleId}` : '/editor')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <div className="fixed inset-0 app-safe-top-14 z-20 bg-black/30 flex items-start justify-center p-3 sm:p-6">
        <div className="bg-white w-full h-full max-w-6xl rounded-2xl shadow-2xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-center">
            <h1 className="text-lg font-semibold text-gray-900">Photo Assembly</h1>
          </div>
          <div className="flex-1 overflow-y-auto">
            <PhotoAssembly onComplete={handleComplete} onCancel={handleCancel} />
          </div>
        </div>
      </div>
    </div>
  )
}
