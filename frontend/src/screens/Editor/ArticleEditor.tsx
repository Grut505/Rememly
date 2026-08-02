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
import { PdfArticlePreviewModal } from '../../ui/PdfArticlePreviewModal'
import { formatDateTimeFull } from '../../utils/date'
import { configApi } from '../../api/config'
import { usersApi, DeclaredUser } from '../../api/users'
import { useProjectsStore } from '../../state/projectsStore'

interface FamileoImportData {
  text: string
  date: string
  author: string
  imageBase64: string
  imageMimeType: string
}

interface AssemblyReturnData {
  fromAssembly: true
  assembledPhotoBase64: string
  assemblyState: object
  lastPhotoDate?: string
  texte: string
  dateModification: string
  articleStatus: ArticleStatus
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
  const [showPdfPreview, setShowPdfPreview] = useState(false)
  const [articleStatus, setArticleStatus] = useState<ArticleStatus>('DRAFT')
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [assemblyStateData, setAssemblyStateData] = useState<object | undefined>(undefined)
  const [autoDateFromPhoto, setAutoDateFromPhoto] = useState(true)
  const [articleFullPage, setArticleFullPage] = useState(false)
  const [articleAuthor, setArticleAuthor] = useState('')
  const [declaredUsers, setDeclaredUsers] = useState<DeclaredUser[]>([])
  const [articleProjectIds, setArticleProjectIds] = useState<string[]>([])
  const { projects, load: loadProjects } = useProjectsStore()

  const initialSnapshotRef = useRef<{
    texte: string
    dateModification: string
    photoFile: File | null
    articleStatus: ArticleStatus
    articleAuthor: string
    articleProjectIds: string[]
    articleFullPage: boolean
  } | null>(null)

  const isEditMode = !!id
  const isDeleted = articleStatus === 'DELETED'
  const isDraft = articleStatus === 'DRAFT'
  const hasPhoto = !!previewUrl
  const hasText = texte.trim().length > 0
  const hasContent = hasPhoto || hasText
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

  // Coming back from Photo Assembly: it no longer saves the article itself,
  // it hands the assembled photo back here so the user can still review/edit
  // text, date and status before saving - restore the text/date/status it
  // carried over too, since they reflect anything the user had already typed
  // before opening Assembly (loadArticle, below, is skipped in this case so
  // it can't clobber this with the server's stale copy).
  useEffect(() => {
    const state = location.state as AssemblyReturnData | null
    if (!state?.fromAssembly) return

    setTexte(state.texte)
    setDateModification(state.dateModification)
    setArticleStatus(state.articleStatus)
    setAssemblyStateData(state.assemblyState)

    if (state.lastPhotoDate && !isEditMode && autoDateFromPhoto) {
      setDateModification(state.lastPhotoDate)
    }

    // loadArticle() is skipped for this mount (see the effect below) to
    // avoid a stale-server-data race against the fresher values above -
    // reconstruct just the snapshot/reference fields it would have set, from
    // the already-loaded store cache.
    if (isEditMode && id) {
      const cached = articles.find((a) => a.id === id)
      if (cached) {
        setArticleImageUrl(cached.image_url || '')
        setArticleImageFileId(cached.image_file_id || '')
        setArticleFullPage(cached.full_page || false)
        setArticleAuthor(cached.auteur || '')
        setArticleProjectIds(cached.project_ids || [])
        initialSnapshotRef.current = {
          texte: cached.texte || '',
          dateModification: cached.date,
          photoFile: null,
          articleStatus: cached.status || 'ACTIVE',
          articleAuthor: cached.auteur || '',
          articleProjectIds: cached.project_ids || [],
          articleFullPage: cached.full_page || false,
        }
      } else {
        // Not in the store yet (e.g. deep-linked straight into edit mode,
        // so Timeline never populated it) - without this fallback,
        // articleAuthor/articleImageUrl/the snapshot were silently left at
        // their blank defaults, which made the save right after Assembly
        // attribute the article to whoever is logged in instead of its
        // real author.
        articlesApi.get(id).then((article) => {
          setArticleImageUrl(article.image_url || '')
          setArticleImageFileId(article.image_file_id || '')
          setArticleFullPage(article.full_page || false)
          setArticleAuthor(article.auteur || '')
          setArticleProjectIds(article.project_ids || [])
          initialSnapshotRef.current = {
            texte: article.texte || '',
            dateModification: article.date,
            photoFile: null,
            articleStatus: article.status || 'ACTIVE',
            articleAuthor: article.auteur || '',
            articleProjectIds: article.project_ids || [],
            articleFullPage: article.full_page || false,
          }
        }).catch(() => {})
      }
    }

    const dataUrl = `data:image/jpeg;base64,${state.assembledPhotoBase64}`
    setPreviewUrl(dataUrl)
    fetch(dataUrl)
      .then((res) => res.blob())
      .then((blob) => {
        setPhotoFile(new File([blob], 'assembled.jpg', { type: 'image/jpeg' }))
      })

    window.history.replaceState({}, document.title)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  useEffect(() => {
    configApi.get('auto_date_from_photo')
      .then((result) => setAutoDateFromPhoto(result.value !== 'false'))
      .catch(() => setAutoDateFromPhoto(true))
  }, [])

  useEffect(() => {
    usersApi.list()
      .then((response) => {
        const activeUsers = (response.users || []).filter((u) => String(u.status || '').toUpperCase() === 'ACTIVE')
        setDeclaredUsers(activeUsers)
      })
      .catch(() => setDeclaredUsers([]))
  }, [])

  useEffect(() => {
    loadProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // New articles default to whoever is creating them - existing articles
  // get their real author from loadArticle/the Assembly-restore effect
  // instead, so this only ever applies before either of those can run.
  useEffect(() => {
    if (!isEditMode && user?.email) {
      setArticleAuthor(user.email)
    }
  }, [isEditMode, user])

  // New articles default to the project marked as default in Settings -
  // projects load asynchronously, so this can't just be part of the
  // synchronous initial snapshot below like articleAuthor is. Updates the
  // snapshot's baseline alongside the live state so this default doesn't
  // itself show up as an unsaved change once it lands.
  useEffect(() => {
    if (!isEditMode && projects.length > 0 && articleProjectIds.length === 0) {
      const defaultProject = projects.find((p) => p.isDefault)
      if (defaultProject) {
        setArticleProjectIds([defaultProject.id])
        if (initialSnapshotRef.current) {
          initialSnapshotRef.current = { ...initialSnapshotRef.current, articleProjectIds: [defaultProject.id] }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, projects])

  useEffect(() => {
    const fromAssembly = (location.state as AssemblyReturnData | null)?.fromAssembly
    // Coming back from Assembly is handled entirely by the effect above
    // (which restores the real texte/date/status/snapshot) - loadArticle
    // would otherwise race it with the server's stale copy (see that
    // effect's comment), and a blank snapshot here would wrongly reset the
    // unsaved-changes baseline.
    if (fromAssembly) return
    if (isEditMode) {
      loadArticle()
    } else {
      initialSnapshotRef.current = {
        texte: '',
        dateModification,
        photoFile: null,
        articleStatus: 'DRAFT',
        articleAuthor: user?.email || '',
        articleProjectIds: [],
        articleFullPage: false,
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (isEditMode && !photoFile && loadedImageSrc) {
      setPreviewUrl(loadedImageSrc)
    }
  }, [isEditMode, photoFile, loadedImageSrc])

  useEffect(() => {
    if (isLoading) return
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
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
        setArticleFullPage(cached.full_page || false)
        setArticleAuthor(cached.auteur || '')
        setArticleProjectIds(cached.project_ids || [])
        initialSnapshotRef.current = {
          texte: cached.texte || '',
          dateModification: cached.date,
          photoFile: null,
          articleStatus: cached.status || 'ACTIVE',
          articleAuthor: cached.auteur || '',
          articleProjectIds: cached.project_ids || [],
          articleFullPage: cached.full_page || false,
        }
        return
      }

      const article = await articlesApi.get(id)
      setTexte(article.texte)
      setDateModification(article.date)
      setArticleImageUrl(article.image_url || '')
      setArticleImageFileId(article.image_file_id || '')
      setArticleStatus(article.status || 'ACTIVE')
      setArticleFullPage(article.full_page || false)
      setArticleAuthor(article.auteur || '')
      setArticleProjectIds(article.project_ids || [])
      initialSnapshotRef.current = {
        texte: article.texte,
        dateModification: article.date,
        photoFile: null,
        articleStatus: article.status || 'ACTIVE',
        articleAuthor: article.auteur || '',
        articleProjectIds: article.project_ids || [],
        articleFullPage: article.full_page || false,
      }
    } catch (error) {
      showToast('Failed to load article', 'error')
      navigate('/')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    if (!hasContent) {
      showToast('Please add a photo or some text', 'error')
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
          assemblyStateData,
          articleFullPage,
          newStatus,
          undefined, // famileoPostId
          undefined, // famileoMarked
          articleAuthor || user.email,
          articleProjectIds
        )
        updateArticleInStore(updated)
        showToast(isDeleted ? 'Article restored' : 'Article updated', 'success')
      } else {
        await articlesService.createArticle(
          articleAuthor || user.email,
          texte,
          photoFile || undefined,
          dateModification,
          undefined, // famileoPostId
          assemblyStateData,
          articleFullPage,
          articleStatus,
          articleProjectIds
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

  const sameProjectIds = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i])

  const hasUnsavedChanges = () => {
    const initial = initialSnapshotRef.current
    if (!initial) return false
    return (
      texte !== initial.texte ||
      dateModification !== initial.dateModification ||
      articleStatus !== initial.articleStatus ||
      articleAuthor !== initial.articleAuthor ||
      !sameProjectIds(articleProjectIds, initial.articleProjectIds) ||
      articleFullPage !== initial.articleFullPage ||
      photoFile !== null
    )
  }

  const discardAndClose = () => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl)
    }
    navigate('/')
  }

  const handleCancel = () => {
    if (hasUnsavedChanges()) {
      setShowCancelConfirm(true)
      return
    }
    discardAndClose()
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
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-center flex-shrink-0 sticky app-safe-top-14 z-20 relative">
        {hasContent && (
          <button
            type="button"
            onClick={() => setShowPdfPreview(true)}
            className="absolute left-4 top-1/2 -translate-y-1/2 inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
            aria-label="Preview in PDF"
          >
            <svg className="w-4 h-4" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M14 3v4a1 1 0 001 1h4"></path>
              <path d="M17 21H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z"></path>
            </svg>
            PDF
          </button>
        )}
        <h1 className="text-lg font-semibold">
          {isEditMode ? 'Edit Article' : 'New Article'}
        </h1>
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFamileoPoster(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
            aria-label="Poster vers Famileo"
          >
            <svg className="w-4 h-4" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M22 2L11 13"></path>
              <path d="M22 2l-7 20-4-9-9-4 20-7z"></path>
            </svg>
            Famileo
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 p-4 space-y-6 pb-28">
        <div className="flex flex-row gap-2 items-end">
          <div className="flex-1 min-w-0">
            <DateTimeInput value={dateModification} onChange={setDateModification} />
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-sm font-medium text-gray-700 mb-1">Author</label>
            <select
              value={articleAuthor}
              onChange={(e) => setArticleAuthor(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
            >
              {articleAuthor && !declaredUsers.some((declaredUser) => declaredUser.email === articleAuthor) && (
                <option value={articleAuthor}>{articleAuthor}</option>
              )}
              {declaredUsers.map((declaredUser) => (
                <option key={declaredUser.email} value={declaredUser.email}>
                  {declaredUser.pseudo || declaredUser.email}
                </option>
              ))}
            </select>
          </div>
        </div>

        {projects.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Projects</label>
            <div className="flex flex-wrap gap-2">
              {projects.map((project) => {
                const checked = articleProjectIds.includes(project.id)
                return (
                  <label
                    key={project.id}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${
                      checked
                        ? 'bg-primary-50 border-primary-300 text-primary-700'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setArticleProjectIds(
                          e.target.checked
                            ? [...articleProjectIds, project.id]
                            : articleProjectIds.filter((id) => id !== project.id)
                        )
                      }}
                      className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    {project.name}
                  </label>
                )
              })}
            </div>
          </div>
        )}

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
          currentImage={previewUrl}
          onPhotoAssembly={() => navigate('/photo-assembly', { state: { editMode: isEditMode, articleId: id, texte, dateModification, articleStatus } })}
        />

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={articleFullPage}
            onChange={(e) => setArticleFullPage(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm text-gray-700">Full page in PDF</span>
        </label>

        <TextInput value={texte} onChange={setTexte} />
      </div>

      {/* Actions - fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 py-3 app-safe-x app-safe-bottom">
        <div className="max-w-content mx-auto w-full flex gap-2">
          {isEditMode && !isDeleted && (
            <Button
              variant="danger"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isSaving}
              className="flex-1 px-3 py-2 text-sm"
            >
              Delete
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasContent}
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
      <ConfirmDialog
        isOpen={showCancelConfirm}
        title="Discard changes?"
        message="You have unsaved changes. Are you sure you want to discard them?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        variant="danger"
        onConfirm={discardAndClose}
        onCancel={() => setShowCancelConfirm(false)}
      />
      <FamileoPosterModal
        isOpen={showFamileoPoster}
        onClose={() => setShowFamileoPoster(false)}
        authorLabel={declaredUsers.find((declaredUser) => declaredUser.email === articleAuthor)?.pseudo || articleAuthor || user?.email || 'Unknown'}
        authorEmail={articleAuthor || user?.email || ''}
        dateLabel={formatDateTimeFull(dateModification)}
        excerpt={texte}
        text={texte}
        publishedAt={dateModification}
        imageUrl={articleImageUrl}
        imageFileId={articleImageFileId}
        articleId={id}
        fullPage={articleFullPage}
      />
      <PdfArticlePreviewModal
        isOpen={showPdfPreview}
        onClose={() => setShowPdfPreview(false)}
        articleId={id}
        articleDate={dateModification}
        articleTexte={texte}
        photoFile={photoFile}
        articleImageFileId={articleImageFileId}
        articleFullPage={articleFullPage}
      />
      </div>
    </div>
  )
}
