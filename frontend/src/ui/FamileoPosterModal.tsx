import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { famileoApi } from '../api/famileo'
import { articlesService } from '../services/articles.service'
import { apiClient } from '../api/client'
import { usersApi, DeclaredUser } from '../api/users'

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
  articleId
}: FamileoPosterModalProps) {
  const [isPosting, setIsPosting] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)
  const [postResult, setPostResult] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewSrc, setPreviewSrc] = useState<string>('')
  const [imageBase64, setImageBase64] = useState<string>('')
  const [isFullPage, setIsFullPage] = useState(false)
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

  const allOverride = familyOverrides.all
  const canPost = selectionMode === 'all'
    ? Boolean(allOverride && allOverride.text.length <= 300 && families.length > 0)
    : selectedFamilyIds.length > 0 &&
      selectedFamilyIds.every((id) => {
        const value = familyOverrides[id]?.text || ''
        return value.length <= 300
      })
  const availableFamilies = families.filter((family) => !selectedFamilyIds.includes(String(family.famileo_id)))

  useEffect(() => {
    if (!isOpen) return
    setPostError(null)
    setPostResult(null)
    setIsPosting(false)
    setPreviewError(null)
    setPreviewSrc('')
    setImageBase64('')
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
              fullPage: false,
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

      for (let i = 0; i < targetFamilies.length; i++) {
        const famileoId = targetFamilies[i]
        const family = families.find((f) => String(f.famileo_id) === String(famileoId))
        const override = selectionMode === 'all' ? familyOverrides.all : familyOverrides[famileoId]
        let finalText = override ? override.text : text || ''
        if (finalText.length > 300) {
          throw new Error('Text exceeds 300 characters.')
        }
        if (!finalText || !finalText.trim()) {
          finalText = '\u200b'
        }
        const dateValue = override ? override.date : publishedAt
        const parsedDate = dateValue ? new Date(dateValue) : new Date()
        const finalPublishedAt = isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString()
        const finalAuthorEmail = override ? override.author : baseAuthor

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
          if (famileoPostId) {
            console.log('Famileo post created:', famileoPostId)
          }
          await articlesService.markFamileoPosted(articleId, famileoPostId)
        }
      }
      setPostResult(`Post created for ${targetFamilies.length} ${targetFamilies.length > 1 ? 'families' : 'family'}.`)
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
                  const seed = prev.all || { text: baseText, date: baseDateLocal, fullPage: false, author: baseAuthor }
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
              fullPage: false,
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
                          ...(prev[famileoId] || { text: baseText, date: baseDateLocal, fullPage: false, author: '' }),
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
                  <label className="block text-xs font-medium text-gray-600 mb-1">Text (optional, max 300)</label>
                  <textarea
                    value={override.text}
                    onChange={(e) => {
                      const value = e.target.value.slice(0, 300)
                      setFamilyOverrides((prev) => ({
                        ...prev,
                        [famileoId]: {
                          ...(prev[famileoId] || { text: '', date: baseDateLocal, fullPage: false, author: '' }),
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
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                  <input
                    type="datetime-local"
                    value={toLocalInputValue(override.date || '')}
                    onChange={(e) => {
                      const value = e.target.value
                      setFamilyOverrides((prev) => ({
                        ...prev,
                        [famileoId]: {
                          ...(prev[famileoId] || { text: baseText, date: baseDateLocal, fullPage: false, author: '' }),
                          date: value
                        }
                      }))
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
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
                          ...(prev[famileoId] || { text: baseText, date: baseDateLocal, fullPage: false, author: '' }),
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
