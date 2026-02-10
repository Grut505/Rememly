import { useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
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
  const [isValidating, setIsValidating] = useState(false)

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
    } finally {
      setIsValidating(false)
    }
  }

  const handleCancel = () => {
    if (isValidating) return
    navigate(editMode && articleId ? `/editor/${articleId}` : '/editor')
  }

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ loading?: boolean }>).detail
      if (detail && typeof detail.loading === 'boolean') {
        setIsValidating(detail.loading)
      }
    }
    window.addEventListener('photo-assembly-validating', handler as EventListener)
    return () => {
      window.removeEventListener('photo-assembly-validating', handler as EventListener)
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <div className="fixed inset-0 app-safe-top-14 z-20 bg-black/30 flex items-start justify-center p-3 sm:p-6">
        <div className="bg-white w-full h-full max-w-6xl rounded-2xl shadow-2xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('photo-assembly-cancel'))}
              disabled={isValidating}
              className={`p-2 rounded-full border transition-colors ${
                isValidating
                  ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                  : 'border-gray-200 text-gray-600 hover:text-gray-800 hover:bg-gray-100'
              }`}
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-gray-900">Photo Assembly</h1>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('photo-assembly-validate'))}
              disabled={isValidating}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${isValidating ? 'bg-green-300 text-white cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}
            >
              {isValidating ? 'Processing...' : 'Valider'}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto relative">
            <PhotoAssembly onComplete={handleComplete} onCancel={handleCancel} />
            {isValidating && (
              <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-20">
                <div className="flex items-center gap-3 text-sm text-gray-700 bg-white px-4 py-3 rounded-xl shadow">
                  <div className="w-5 h-5 border-2 border-green-200 border-t-green-600 rounded-full animate-spin"></div>
                  Creating article...
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
