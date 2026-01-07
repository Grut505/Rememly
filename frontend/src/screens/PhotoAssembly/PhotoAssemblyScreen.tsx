import { useNavigate, useLocation } from 'react-router-dom'
import { PhotoAssembly } from '../../modules/photo-assembly/PhotoAssembly'
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
          assemblyState
        )
        updateArticleInStore(updated)
        showToast('Article updated', 'success')
      } else {
        // Create new article
        await articlesService.createArticle(user.name, texte, file, assemblyState)
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

  return <PhotoAssembly onComplete={handleComplete} onCancel={handleCancel} />
}
