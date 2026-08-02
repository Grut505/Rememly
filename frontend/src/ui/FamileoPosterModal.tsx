import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { DatePicker } from './DatePicker'
import { famileoApi } from '../api/famileo'
import { articlesService } from '../services/articles.service'
import { apiClient, ApiError } from '../api/client'
import { usersApi, DeclaredUser } from '../api/users'
import { useUiStore } from '../state/uiStore'
import { useArticlesStore } from '../state/articlesStore'

interface FamileoPosterModalProps {
  isOpen: boolean
  onClose: () => void
  authorLabel?: string
  authorEmail?: string
  dateLabel?: string
  excerpt?: string
  text?: string
  publishedAt?: string
  familyId?: string
  imageUrl?: string
  imageFileId?: string
  articleId?: string
  fullPage?: boolean
}

// Famileo only accepts two postcard aspect ratios (same constants used by
// the Photo Assembly layout picker's "Famileo" ratio filter) - portrait
// width:height = 1:1.44, landscape width:height = 1:0.54.
const FAMILEO_PORTRAIT_RATIO = 1 / 1.44
const FAMILEO_LANDSCAPE_RATIO = 1 / 0.54
const FAMILEO_RATIO_TOLERANCE = 0.03

function loadImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('Failed to read image dimensions.'))
    img.src = src
  })
}

function cropImageToRatio(src: string, targetRatio: number): Promise<{ base64: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const sourceRatio = img.naturalWidth / img.naturalHeight
      let cropWidth = img.naturalWidth
      let cropHeight = img.naturalHeight
      if (sourceRatio > targetRatio) {
        cropWidth = Math.round(img.naturalHeight * targetRatio)
      } else {
        cropHeight = Math.round(img.naturalWidth / targetRatio)
      }
      const offsetX = Math.round((img.naturalWidth - cropWidth) / 2)
      const offsetY = Math.round((img.naturalHeight - cropHeight) / 2)

      const canvas = document.createElement('canvas')
      canvas.width = cropWidth
      canvas.height = cropHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas not supported.'))
        return
      }
      ctx.drawImage(img, offsetX, offsetY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
      resolve({ base64: dataUrl.split(',')[1] || '', width: cropWidth, height: cropHeight })
    }
    img.onerror = () => reject(new Error('Failed to load image for resizing.'))
    img.src = src
  })
}

function extractFileId(url: string): string | null {
  if (!url) return null
  const patterns = [
    /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/,
    /drive\.google\.com\/uc\?.*id=([A-Za-z0-9_-]+)/,
    /drive\.google\.com\/open\?.*id=([A-Za-z0-9_-]+)/,
    /drive\.google\.com\/thumbnail\?.*id=([A-Za-z0-9_-]+)/,
    /lh3\.googleusercontent\.com\/d\/([A-Za-z0-9_-]+)/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match && match[1]) {
      return match[1]
    }
  }
  return null
}

export function FamileoPosterModal({
  isOpen,
  onClose,
  authorLabel,
  authorEmail,
  dateLabel,
  excerpt,
  text,
  publishedAt,
  familyId,
  imageUrl,
  imageFileId,
  articleId,
  fullPage
}: FamileoPosterModalProps) {
  const { showToast } = useUiStore()
  const updateArticleInStore = useArticlesStore((state) => state.updateArticle)
  const [isPosting, setIsPosting] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)
  const [postResult, setPostResult] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewSrc, setPreviewSrc] = useState<string>('')
  const [imageBase64, setImageBase64] = useState<string>('')
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null)
  const [isResizingImage, setIsResizingImage] = useState(false)
  const [formatWarningDismissed, setFormatWarningDismissed] = useState(false)
  const [isFullPage, setIsFullPage] = useState(fullPage || false)
  const [progressLabel, setProgressLabel] = useState<string | null>(null)
  const [progressStep, setProgressStep] = useState(0)
  const [progressTotal, setProgressTotal] = useState(0)
  const [families, setFamilies] = useState<{ id: string; name: string; famileo_id: string }[]>([])
  const [loadingFamilies, setLoadingFamilies] = useState(false)
  const [selectedFamilyIds, setSelectedFamilyIds] = useState<string[]>(familyId ? [familyId] : [])
  const [familyOverrides, setFamilyOverrides] = useState<Record<string, { text: string; date: string; fullPage: boolean; author: string }>>({})
  const [selectionMode, setSelectionMode] = useState<'all' | 'custom'>(familyId ? 'custom' : 'all')
  const [currentFamilyIndex, setCurrentFamilyIndex] = useState(0)
  const [selectedFamilyNames, setSelectedFamilyNames] = useState<Record<string, string>>({})
  const [declaredUsers, setDeclaredUsers] = useState<DeclaredUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const baseText = text || ''
  const baseDate = publishedAt || new Date().toISOString()
  const baseAuthor = authorEmail || ''
  const defaultFullPage = fullPage || false
  const familiesById = families.reduce<Record<string, string>>((acc, family) => {
    acc[String(family.famileo_id)] = family.name
    return acc
  }, {})

  const toLocalInputValue = (value: string) => {
    if (!value) return ''
    const date = new Date(value)
    if (isNaN(date.getTime())) return value
    const pad = (n: number) => String(n).padStart(2, '0')
    const yyyy = date.getFullYear()
    const mm = pad(date.getMonth() + 1)
    const dd = pad(date.getDate())
    const hh = pad(date.getHours())
    const min = pad(date.getMinutes())
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`
  }
  const baseDateLocal = toLocalInputValue(baseDate)

  // Famileo has nothing to show for a family with neither a photo nor any
  // text - the photo is shared across all families (set once for the whole
  // article), text is set per-family below.
  const articleHasPhoto = Boolean(imageFileId || extractFileId(imageUrl || ''))
  const hasContentFor = (familyText: string) => articleHasPhoto || Boolean(familyText && familyText.trim())

  const allOverride = familyOverrides.all
  const canPost = selectionMode === 'all'
    ? Boolean(allOverride && allOverride.text.length <= 300 && families.length > 0 && hasContentFor(allOverride.text))
    : selectedFamilyIds.length > 0 &&
      selectedFamilyIds.every((id) => {
        const value = familyOverrides[id]?.text || ''
        return value.length <= 300 && hasContentFor(value)
      })
  const availableFamilies = families.filter((family) => !selectedFamilyIds.includes(String(family.famileo_id)))

  const imageRatio = imageDimensions ? imageDimensions.width / imageDimensions.height : null
  const famileoTargetRatio = imageRatio !== null && imageRatio > 1 ? FAMILEO_LANDSCAPE_RATIO : FAMILEO_PORTRAIT_RATIO
  const isFamileoFormat = imageRatio !== null && (
    Math.abs(imageRatio - FAMILEO_PORTRAIT_RATIO) < FAMILEO_RATIO_TOLERANCE ||
    Math.abs(imageRatio - FAMILEO_LANDSCAPE_RATIO) < FAMILEO_RATIO_TOLERANCE
  )
  const showFormatWarning = imageRatio !== null && !isFamileoFormat && !formatWarningDismissed

  const handleResizeToFamileoFormat = async () => {
    if (!previewSrc) return
    setIsResizingImage(true)
    try {
      const cropped = await cropImageToRatio(previewSrc, famileoTargetRatio)
      setImageBase64(cropped.base64)
      setPreviewSrc(`data:image/jpeg;base64,${cropped.base64}`)
      setImageDimensions({ width: cropped.width, height: cropped.height })
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Failed to resize image.')
    } finally {
      setIsResizingImage(false)
    }
  }

  useEffect(() => {
    if (!isOpen) return
    setPostError(null)
    setPostResult(null)
    setIsPosting(false)
    setPreviewError(null)
    setPreviewSrc('')
    setImageBase64('')
    setImageDimensions(null)
    setFormatWarningDismissed(false)
    setPreviewLoading(false)
    setProgressLabel(null)
    setProgressStep(0)
    setProgressTotal(0)
    setSelectedFamilyIds(familyId ? [familyId] : [])
    setSelectionMode(familyId ? 'custom' : 'all')
    setCurrentFamilyIndex(0)
    setFamilyOverrides({})
    setSelectedFamilyNames({})
  }, [isOpen, familyId])

  useEffect(() => {
    if (!previewSrc) {
      setImageDimensions(null)
      return
    }
    let cancelled = false
    loadImageDimensions(previewSrc)
      .then((dims) => {
        if (!cancelled) setImageDimensions(dims)
      })
      .catch(() => {
        if (!cancelled) setImageDimensions(null)
      })
    return () => {
      cancelled = true
    }
  }, [previewSrc])

  useEffect(() => {
    if (!isOpen) return
    setLoadingFamilies(true)
    famileoApi.families()
      .then((response) => {
        setFamilies(response.families || [])
        setFamilyOverrides((prev) => {
          if (prev.all) return prev
          return {
            ...prev,
            all: {
              text: baseText,
              date: baseDateLocal,
              fullPage: defaultFullPage,
              author: baseAuthor
            }
          }
        })
      })
      .catch(() => {
        setFamilies([])
      })
      .finally(() => {
        setLoadingFamilies(false)
      })
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    setLoadingUsers(true)
    usersApi.list()
      .then((response) => {
        const activeUsers = (response.users || []).filter((user) => String(user.status || '').toUpperCase() === 'ACTIVE')
        setDeclaredUsers(activeUsers)
      })
      .catch(() => {
        setDeclaredUsers([])
      })
      .finally(() => {
        setLoadingUsers(false)
      })
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const fileId = imageFileId || extractFileId(imageUrl || '')
    if (!fileId) return
    setPreviewLoading(true)
    setPreviewError(null)
    apiClient.get<{ base64: string }>('image/fetch', { fileId })
      .then((response) => {
        if (!response.base64) {
          throw new Error('Image not found.')
        }
        setImageBase64(response.base64)
        setPreviewSrc(`data:image/jpeg;base64,${response.base64}`)
      })
      .catch((err) => {
        setPreviewError(err instanceof Error ? err.message : 'Failed to load image.')
      })
      .finally(() => {
        setPreviewLoading(false)
      })
  }, [isOpen, imageUrl, imageFileId])

  // The backend auto-triggers a ~2min GitHub Actions cookie refresh whenever
  // it detects an expired Famileo session (see FAMILEO_SESSION in
  // workers/src/routes/famileo.ts) - without this, a single expired-session
  // hiccup mid-post surfaced a raw "Session Famileo expirée" error and forced
  // the user to manually retry the whole send. Poll famileo/status the same
  // way FamileoBrowser's waitForSessionValid does, then retry the failed
  // step once automatically.
  const waitForFamileoSession = async () => {
    const maxAttempts = 20
    for (let i = 0; i < maxAttempts; i++) {
      setProgressLabel('Session Famileo expirée. Rafraîchissement en cours…')
      try {
        const status = await famileoApi.status({ validate: 'true' })
        if (status.valid) return true
      } catch {
        // keep waiting - status itself can transiently fail during the refresh
      }
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
    return false
  }

  const isFamileoSessionError = (err: unknown) => err instanceof ApiError && err.code === 'FAMILEO_SESSION'

  const handlePost = async () => {
    if (selectionMode === 'all' && families.length === 0) {
      setPostError('No families available.')
      return
    }
    if (selectionMode === 'custom' && selectedFamilyIds.length === 0) {
      setPostError('Please select a family.')
      return
    }
    setIsPosting(true)
    setPostError(null)
    setPostResult(null)
    try {
      const fileId = imageFileId || extractFileId(imageUrl || '')
      let base64 = imageBase64
      if (fileId && !base64) {
        setProgressLabel('Loading image…')
        base64 = (await apiClient.get<{ base64: string }>('image/fetch', { fileId })).base64
      }

      const targetFamilies = selectionMode === 'all'
        ? families.map((family) => family.famileo_id)
        : selectedFamilyIds

      const stepsPerFamily = base64 ? 2 : 1
      const totalSteps = targetFamilies.length * stepsPerFamily
      setProgressTotal(totalSteps)
      setProgressStep(0)

      const failures: { name: string; message: string }[] = []
      let sessionUnrecoverable = false

      for (let i = 0; i < targetFamilies.length; i++) {
        const famileoId = targetFamilies[i]
        const family = families.find((f) => String(f.famileo_id) === String(famileoId))
        const familyName = family ? family.name : 'Unknown family'

        if (sessionUnrecoverable) {
          failures.push({ name: familyName, message: 'Famileo session unavailable.' })
          continue
        }

        const override = selectionMode === 'all' ? familyOverrides.all : familyOverrides[famileoId]
        let finalText = override ? override.text : text || ''
        if (finalText.length > 300) {
          failures.push({ name: familyName, message: 'Text exceeds 300 characters.' })
          continue
        }
        if (!finalText || !finalText.trim()) {
          if (!articleHasPhoto) {
            failures.push({ name: familyName, message: 'No photo and no text - nothing to post.' })
            continue
          }
          finalText = '\u200b'
        }
        const dateValue = override ? override.date : publishedAt
        const parsedDate = dateValue ? new Date(dateValue) : new Date()
        const finalPublishedAt = isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString()
        const finalAuthorEmail = override ? override.author : baseAuthor

        const sendToFamily = async () => {
          if (base64) {
            setProgressLabel(`Uploading image · ${family ? family.name : 'Unknown family'}`)
            setProgressStep((prev) => prev + 1)
          }
          let imageKey = ''
          if (base64) {
            const presign = await famileoApi.presignImage({
              author_email: finalAuthorEmail || undefined,
            })
            const presignObj = JSON.parse(presign.raw)
            const upload = await famileoApi.uploadImage({
              presign: presignObj,
              image_base64: base64,
              mime_type: 'image/jpeg',
              filename: 'Untitled.jpg',
              author_email: finalAuthorEmail || undefined,
            })
            imageKey = upload.key || ''
          }

          setProgressLabel(`Creating post · ${family ? family.name : 'Unknown family'}`)
          setProgressStep((prev) => prev + 1)
          const response = await famileoApi.createPost({
            text: finalText,
            published_at: finalPublishedAt,
            family_id: famileoId,
            image_key: imageKey || undefined,
            is_full_page: override ? override.fullPage : isFullPage,
            author_email: finalAuthorEmail || undefined,
          })
          const body = response && typeof response.body === 'string' ? response.body : ''
          let famileoPostId: string | undefined
          if (body) {
            try {
              const parsed = JSON.parse(body)
              famileoPostId =
                parsed?.id ||
                parsed?.post_id ||
                parsed?.wall_post_id ||
                parsed?.familyPost?.wall_post_id ||
                parsed?.data?.id ||
                parsed?.data?.post_id
            } catch {
              // ignore non-json body
            }
          }
          if (articleId) {
            const updated = await articlesService.markFamileoPosted(articleId, famileoPostId)
            updateArticleInStore(updated)
          }
        }

        try {
          try {
            await sendToFamily()
          } catch (err) {
            if (!isFamileoSessionError(err)) throw err
            const recovered = await waitForFamileoSession()
            if (!recovered) {
              sessionUnrecoverable = true
              throw err
            }
            await sendToFamily()
          }
        } catch (err) {
          failures.push({ name: familyName, message: err instanceof Error ? err.message : 'Error while posting to Famileo.' })
        }
      }

      const successCount = targetFamilies.length - failures.length
      if (failures.length === 0) {
        const message = `Post created for ${targetFamilies.length} ${targetFamilies.length > 1 ? 'families' : 'family'}.`
        setPostResult(message)
        showToast(message, 'success')
      } else if (successCount > 0) {
        const message = `Sent to ${successCount}/${targetFamilies.length} families. Failed: ${failures.map((f) => f.name).join(', ')}.`
        setPostResult(message)
        showToast(`Sent to ${successCount}/${targetFamilies.length} families (${failures.length} failed).`, 'error')
      } else {
        throw new Error(failures[0]?.message || 'Error while posting to Famileo.')
      }
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'Error while posting to Famileo.')
    } finally {
      setIsPosting(false)
      setProgressLabel(null)
      setProgressStep(0)
      setProgressTotal(0)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Famileo Poster" align="center">
      <div className="px-4 py-4 space-y-4 text-sm text-gray-700 relative">
        {isPosting && (
          <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-md w-full max-w-xs">
              <div className="flex items-center gap-3 text-sm text-gray-700">
                <div className="w-4 h-4 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
                <div className="flex-1">
                  <div className="font-medium">{progressLabel || 'Processing...'}</div>
                  {progressTotal > 0 && (
                    <div className="mt-1 text-xs text-gray-500">
                      Step {Math.min(progressStep, progressTotal)} / {progressTotal}
                    </div>
                  )}
                </div>
              </div>
              {progressTotal > 0 && (
                <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-600 transition-all"
                    style={{ width: `${Math.min(progressStep, progressTotal) / progressTotal * 100}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        )}
        {(authorLabel || dateLabel || excerpt || previewSrc || previewLoading) && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 flex items-start gap-3">
            <div className="flex-1 space-y-1">
              {authorLabel && (
                <div className="text-xs text-gray-500">Author</div>
              )}
              {authorLabel && (
                <div className="text-sm font-medium text-gray-900">{authorLabel}</div>
              )}
              {dateLabel && (
                <div className="text-xs text-gray-500">Date</div>
              )}
              {dateLabel && (
                <div className="text-sm text-gray-800">{dateLabel}</div>
              )}
              {excerpt && (
                <div className="text-xs text-gray-500">Excerpt</div>
              )}
              {excerpt && (
                <div className="text-sm text-gray-800 whitespace-pre-wrap">{excerpt}</div>
              )}
            </div>
            <div className="w-20 flex-shrink-0">
              {previewLoading && (
                <div className="text-xs text-gray-500">Image…</div>
              )}
              {previewError && (
                <div className="text-xs text-red-600">{previewError}</div>
              )}
              {!previewLoading && !previewError && previewSrc && (
                <img src={previewSrc} alt="" className="w-20 h-20 object-cover rounded-md border border-gray-100" />
              )}
              {!previewLoading && !previewError && !previewSrc && (
                <div className="text-xs text-gray-500">No image</div>
              )}
            </div>
          </div>
        )}

        {showFormatWarning && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex items-start gap-2">
            <div className="flex-1 text-xs text-amber-800">
              This image isn't in a Famileo-supported format ({famileoTargetRatio > 1 ? 'landscape' : 'portrait'} 1:{famileoTargetRatio > 1 ? '0.54' : '1.44'}). It may be cropped unexpectedly by Famileo.
            </div>
            <button
              type="button"
              onClick={handleResizeToFamileoFormat}
              disabled={isResizingImage}
              className="text-xs font-medium text-amber-900 underline hover:no-underline disabled:opacity-60 flex-shrink-0"
            >
              {isResizingImage ? 'Resizing…' : 'Resize'}
            </button>
            <button
              type="button"
              onClick={() => setFormatWarningDismissed(true)}
              className="text-xs text-amber-700 hover:text-amber-900 flex-shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Families</label>
            <select
              value={selectionMode === 'all' ? 'all' : ''}
              onChange={(e) => {
                const value = e.target.value
                const label = e.target.selectedOptions[0]?.text || ''
                if (value === 'all') {
                  setSelectionMode('all')
                  setSelectedFamilyIds([])
                  setCurrentFamilyIndex(0)
                  return
                }
                if (!value) return
                setSelectionMode('custom')
                setSelectedFamilyIds((prev) => (prev.includes(value) ? prev : [...prev, value]))
                setSelectedFamilyNames((prev) => ({
                  ...prev,
                  [value]: label,
                }))
                setFamilyOverrides((prev) => {
                  if (prev[value]) return prev
                  const seed = prev.all || { text: baseText, date: baseDateLocal, fullPage: defaultFullPage, author: baseAuthor }
                  return {
                    ...prev,
                    [value]: {
                      text: seed.text,
                      date: seed.date || baseDateLocal,
                      fullPage: seed.fullPage || false,
                      author: seed.author || baseAuthor,
                    }
                  }
                })
                setCurrentFamilyIndex((prev) => (prev === 0 ? 0 : prev))
              }}
              disabled={loadingFamilies}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white disabled:bg-gray-100"
            >
              <option value="">Select a family</option>
              {selectedFamilyIds.length === 0 && (
                loadingFamilies ? (
                  <option value="all">Loading families...</option>
                ) : (
                  <option value="all">All families</option>
                )
              )}
              {availableFamilies.map((family) => (
                  <option key={String(family.famileo_id)} value={String(family.famileo_id)}>
                    {family.name}
                  </option>
                ))}
            </select>
          </div>

          {selectionMode === 'custom' && selectedFamilyIds.length === 0 && (
            <div className="text-xs text-amber-600">At least one family must be selected.</div>
          )}

          {selectionMode === 'custom' && selectedFamilyIds.length > 0 && (
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setCurrentFamilyIndex((prev) => Math.max(prev - 1, 0))}
                disabled={currentFamilyIndex === 0}
                className="px-3 py-2 text-lg text-gray-600 disabled:opacity-40"
              >
                ←
              </button>
              <div className="text-sm font-semibold text-gray-900">
                {familiesById[selectedFamilyIds[currentFamilyIndex]] || selectedFamilyNames[selectedFamilyIds[currentFamilyIndex]] || 'Unknown family'}
              </div>
              <button
                type="button"
                onClick={() => setCurrentFamilyIndex((prev) => Math.min(prev + 1, selectedFamilyIds.length - 1))}
                disabled={currentFamilyIndex === selectedFamilyIds.length - 1}
                className="px-3 py-2 text-lg text-gray-600 disabled:opacity-40"
              >
                →
              </button>
            </div>
          )}

          {(() => {
            const famileoId = selectionMode === 'custom' ? selectedFamilyIds[currentFamilyIndex] : 'all'
            if (!famileoId) return null
            const override = familyOverrides[famileoId] || {
              text: baseText,
              date: baseDateLocal,
              fullPage: defaultFullPage,
              author: baseAuthor
            }
            return (
              <div className="border border-gray-200 rounded-lg p-3 space-y-3">
                {selectionMode === 'custom' && (
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFamilyIds((prev) => {
                          const next = prev.filter((id) => id !== famileoId)
                          if (next.length === 0) {
                            setSelectionMode('all')
                            setCurrentFamilyIndex(0)
                          } else {
                            setCurrentFamilyIndex((idx) => Math.max(Math.min(idx, next.length - 1), 0))
                          }
                          return next
                        })
                        setSelectedFamilyNames((prev) => {
                          const next = { ...prev }
                          delete next[famileoId]
                          return next
                        })
                      }}
                      className="text-xs text-gray-500 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Author (Rememly)</label>
                  <select
                    value={override.author || ''}
                    onChange={(e) => {
                      const value = e.target.value
                      setFamilyOverrides((prev) => ({
                        ...prev,
                        [famileoId]: {
                          ...(prev[famileoId] || { text: baseText, date: baseDateLocal, fullPage: defaultFullPage, author: '' }),
                          author: value
                        }
                      }))
                    }}
                    disabled={loadingUsers}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white disabled:bg-gray-100"
                  >
                    {loadingUsers ? (
                      <option value="">Loading authors...</option>
                    ) : (
                      <option value="">Select an author…</option>
                    )}
                    {declaredUsers.map((user) => (
                      <option key={user.email} value={user.email}>
                        {user.pseudo || user.email}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Text {articleHasPhoto ? '(optional, max 300)' : '(required - no photo, max 300)'}
                  </label>
                  <textarea
                    value={override.text}
                    onChange={(e) => {
                      const value = e.target.value.slice(0, 300)
                      setFamilyOverrides((prev) => ({
                        ...prev,
                        [famileoId]: {
                          ...(prev[famileoId] || { text: '', date: baseDateLocal, fullPage: defaultFullPage, author: '' }),
                          text: value
                        }
                      }))
                    }}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    {override.text.length}/300
                  </div>
                  {!hasContentFor(override.text) && (
                    <div className="text-xs text-amber-600 mt-1">No photo - please add some text to send this family a post.</div>
                  )}
                </div>
                <div>
                  <DatePicker
                    label="Date"
                    mode="datetime"
                    value={toLocalInputValue(override.date || '')}
                    onChange={(value) => {
                      setFamilyOverrides((prev) => ({
                        ...prev,
                        [famileoId]: {
                          ...(prev[famileoId] || { text: baseText, date: baseDateLocal, fullPage: defaultFullPage, author: '' }),
                          date: value
                        }
                      }))
                    }}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={override.fullPage || false}
                    onChange={(e) => {
                      const value = e.target.checked
                      setFamilyOverrides((prev) => ({
                        ...prev,
                        [famileoId]: {
                          ...(prev[famileoId] || { text: baseText, date: baseDateLocal, fullPage: defaultFullPage, author: '' }),
                          fullPage: value
                        }
                      }))
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  Full-page image
                </label>
              </div>
            )
          })()}
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={handlePost}
            disabled={isPosting || !canPost}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-60"
          >
            {isPosting
              ? 'Sending...'
              : `Send to ${selectionMode === 'all' ? families.length : selectedFamilyIds.length} ${selectionMode === 'all' ? (families.length > 1 ? 'families' : 'family') : (selectedFamilyIds.length > 1 ? 'families' : 'family')}`}
          </button>
        </div>
        {progressLabel && (
          <div className="text-sm text-gray-600">
            {progressLabel}
          </div>
        )}
        {postResult && (
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            {postResult}
          </div>
        )}
        {postError && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {postError}
          </div>
        )}
      </div>
    </Modal>
  )
}
