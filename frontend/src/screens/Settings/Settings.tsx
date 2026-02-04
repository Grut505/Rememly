import { useState, useEffect } from 'react'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { Spinner } from '../../ui/Spinner'
import { useUiStore } from '../../state/uiStore'
import { AppHeader } from '../../ui/AppHeader'
import { configApi } from '../../api/config'
import { logsApi } from '../../api/logs'
import { usersApi, DeclaredUser } from '../../api/users'
import { articlesApi } from '../../api/articles'
import { useImageLoader } from '../../hooks/useImageLoader'

export function Settings() {
  const { showToast, setUnsavedChanges } = useUiStore()

  const [familyName, setFamilyName] = useState('')
  const [initialFamilyName, setInitialFamilyName] = useState('')
  const [coverTitle, setCoverTitle] = useState('')
  const [initialCoverTitle, setInitialCoverTitle] = useState('')
  const [coverSubtitle, setCoverSubtitle] = useState('')
  const [initialCoverSubtitle, setInitialCoverSubtitle] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [logsLoading, setLogsLoading] = useState(true)
  const [logsMin, setLogsMin] = useState<number | null>(null)
  const [logsMax, setLogsMax] = useState<number | null>(null)
  const [logsFrom, setLogsFrom] = useState<number | null>(null)
  const [logsTo, setLogsTo] = useState<number | null>(null)
  const [isClearingLogs, setIsClearingLogs] = useState(false)
  const [clearProgress, setClearProgress] = useState(0)
  const [isCleaningProps, setIsCleaningProps] = useState(false)
  const [isBackfilling, setIsBackfilling] = useState(false)
  const [usersLoading, setUsersLoading] = useState(false)
  const [users, setUsers] = useState<DeclaredUser[]>([])
  const isDirty = familyName.trim() !== initialFamilyName.trim()
    || coverTitle.trim() !== initialCoverTitle.trim()
    || coverSubtitle.trim() !== initialCoverSubtitle.trim()

  useEffect(() => {
    loadConfig()
    loadLogsRange()
    loadUsers()
  }, [])

  const loadConfig = async () => {
    try {
      const [familyResult, titleResult, subtitleResult] = await Promise.all([
        configApi.get('family_name'),
        configApi.get('pdf_cover_title'),
        configApi.get('pdf_cover_subtitle'),
      ])
      const familyValue = familyResult.value || ''
      const titleValue = titleResult.value || ''
      const subtitleValue = subtitleResult.value || ''
      setFamilyName(familyValue)
      setInitialFamilyName(familyValue)
      setCoverTitle(titleValue)
      setInitialCoverTitle(titleValue)
      setCoverSubtitle(subtitleValue)
      setInitialCoverSubtitle(subtitleValue)
    } catch (error) {
      showToast('Error while loading', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const nextValue = familyName.trim()
      const nextTitle = coverTitle.trim()
      const nextSubtitle = coverSubtitle.trim()
      await Promise.all([
        configApi.set('family_name', nextValue),
        configApi.set('pdf_cover_title', nextTitle),
        configApi.set('pdf_cover_subtitle', nextSubtitle),
      ])
      setFamilyName(nextValue)
      setInitialFamilyName(nextValue)
      setCoverTitle(nextTitle)
      setInitialCoverTitle(nextTitle)
      setCoverSubtitle(nextSubtitle)
      setInitialCoverSubtitle(nextSubtitle)
      showToast('Configuration saved', 'success')
    } catch (error) {
      showToast('Error while saving', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const loadLogsRange = async () => {
    setLogsLoading(true)
    try {
      const range = await logsApi.getPdfRange()
      const minMs = range.min ? new Date(range.min).getTime() : null
      const maxMs = range.max ? new Date(range.max).getTime() : null
      setLogsMin(minMs)
      setLogsMax(maxMs)
      setLogsFrom(minMs)
      setLogsTo(maxMs)
    } catch (error) {
      showToast('Failed to load logs range', 'error')
    } finally {
      setLogsLoading(false)
    }
  }

  const handleClearLogs = async () => {
    if (logsFrom === null || logsTo === null) return
    setIsClearingLogs(true)
    setClearProgress(0)

    const start = Date.now()
    const timer = setInterval(() => {
      const elapsed = Date.now() - start
      const next = Math.min(90, Math.floor((elapsed / 3000) * 90))
      setClearProgress(next)
    }, 150)

    try {
      const fromIso = new Date(logsFrom).toISOString()
      const toIso = new Date(logsTo).toISOString()
      const result = await logsApi.clearPdfRange(fromIso, toIso)
      setClearProgress(100)
      showToast(`Logs deleted: ${result.deleted}`, 'success')
      await loadLogsRange()
    } catch (error) {
      showToast('Failed to clear logs', 'error')
    } finally {
      clearInterval(timer)
      setTimeout(() => {
        setIsClearingLogs(false)
        setClearProgress(0)
      }, 300)
    }
  }

  const handleCleanupProperties = async () => {
    setIsCleaningProps(true)
    try {
      const result = await logsApi.cleanupPdfProperties()
      showToast(`Properties cleaned: ${result.deleted}, queue removed: ${result.queueRemoved}`, 'success')
    } catch (error) {
      showToast('Failed to cleanup properties', 'error')
    } finally {
      setIsCleaningProps(false)
    }
  }

  const handleBackfillFingerprints = async () => {
    setIsBackfilling(true)
    try {
      const result = await articlesApi.backfillFamileoFingerprints()
      showToast(`Backfill done: ${result.updated}/${result.total}`, 'success')
    } catch (error) {
      showToast('Failed to backfill fingerprints', 'error')
    } finally {
      setIsBackfilling(false)
    }
  }

  const loadUsers = async () => {
    setUsersLoading(true)
    try {
      const response = await usersApi.list()
      setUsers(response.users || [])
    } catch (error) {
      showToast('Failed to load users', 'error')
    } finally {
      setUsersLoading(false)
    }
  }

  const formatDateFr = (ms: number | null) => {
    if (ms === null) return '--'
    return new Date(ms).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  useEffect(() => {
    setUnsavedChanges(isDirty)
  }, [isDirty, setUnsavedChanges])

  const formatUserDate = (value: string) => {
    if (!value) return '--'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '--'
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  const normalizeAvatarUrl = (url: string) => {
    if (!url) return ''
    if (url.includes('drive.google.com/thumbnail')) return url
    const patterns = [
      /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/,
      /drive\.google\.com\/uc\?.*id=([A-Za-z0-9_-]+)/,
      /drive\.google\.com\/open\?.*id=([A-Za-z0-9_-]+)/,
      /lh3\.googleusercontent\.com\/d\/([A-Za-z0-9_-]+)/,
    ]
    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match && match[1]) {
        return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w200`
      }
    }
    return url
  }

  const UserAvatar = ({ user }: { user: DeclaredUser }) => {
    const { src, isLoading, error } = useImageLoader(user.avatar_url, user.avatar_file_id)
    if (isLoading) {
      return (
        <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-200 animate-pulse" />
      )
    }
    if (error || !src) {
      return (
        <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-[10px] text-gray-500">
          --
        </div>
      )
    }
    return (
      <img
        src={src || normalizeAvatarUrl(user.avatar_url)}
        alt={user.pseudo || user.email}
        className="w-7 h-7 rounded-full object-cover border border-gray-200"
      />
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />

      {/* Content */}
      <div className="flex-1 p-4 space-y-6 pb-32 max-w-content mx-auto w-full">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center">
              <Spinner size="lg" />
              <p className="mt-4 text-gray-600">Loading...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Declared users */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Declared users</h3>
                <button
                  onClick={loadUsers}
                  disabled={usersLoading}
                  className="text-xs text-primary-600 hover:text-primary-700"
                >
                  Refresh
                </button>
              </div>
              {usersLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Spinner size="md" />
                </div>
              ) : users.length === 0 ? (
                <p className="text-sm text-gray-500">No users found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="text-gray-500">
                      <tr className="text-left">
                        <th className="py-2 pr-3">Avatar</th>
                        <th className="py-2 pr-3">Email</th>
                        <th className="py-2 pr-3">Pseudo</th>
                        <th className="py-2 pr-3">Famileo</th>
                        <th className="py-2 pr-3">Created</th>
                        <th className="py-2 pr-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-700">
                      {users.map((u) => (
                        <tr key={u.email} className="border-t border-gray-100">
                          <td className="py-2 pr-3">
                            <UserAvatar user={u} />
                          </td>
                          <td className="py-2 pr-3">{u.email}</td>
                          <td className="py-2 pr-3">{u.pseudo || '--'}</td>
                          <td className="py-2 pr-3">{u.famileo_name || '--'}</td>
                          <td className="py-2 pr-3">{formatUserDate(u.date_created)}</td>
                          <td className="py-2 pr-3">{u.status || '--'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Family Name */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">PDF cover page</h3>
              <Input
                label="Family name"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder="e.g., Dupont family"
              />
              <div className="mt-3 space-y-3">
                <Input
                  label="Cover title"
                  value={coverTitle}
                  onChange={(e) => setCoverTitle(e.target.value)}
                  placeholder="e.g., Memory Book"
                />
                <Input
                  label="Cover subtitle"
                  value={coverSubtitle}
                  onChange={(e) => setCoverSubtitle(e.target.value)}
                  placeholder="e.g., 2024 — 2025"
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Appears on the PDF cover title.
              </p>
            </div>

            {/* Logs cleanup */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">PDF logs</h3>
              {logsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Spinner size="md" />
                </div>
              ) : logsMin === null || logsMax === null ? (
                <p className="text-sm text-gray-500">No logs available.</p>
              ) : (
                <>
                  <div className="text-xs text-gray-500 mb-3">
                    {formatDateFr(logsFrom)} → {formatDateFr(logsTo)}
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-500">From</label>
                      <input
                        type="range"
                        min={logsMin}
                        max={logsMax}
                        value={logsFrom ?? logsMin}
                        onChange={(e) => {
                          const value = Number(e.target.value)
                          setLogsFrom(value)
                          if (logsTo !== null && value > logsTo) setLogsTo(value)
                        }}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">To</label>
                      <input
                        type="range"
                        min={logsMin}
                        max={logsMax}
                        value={logsTo ?? logsMax}
                        onChange={(e) => {
                          const value = Number(e.target.value)
                          setLogsTo(value)
                          if (logsFrom !== null && value < logsFrom) setLogsFrom(value)
                        }}
                        className="w-full"
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex justify-center">
                    <Button
                      variant="secondary"
                      onClick={handleClearLogs}
                      disabled={isClearingLogs || logsFrom === null || logsTo === null}
                      className="w-full sm:w-auto"
                    >
                      Clear logs
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* Cleanup properties */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Maintenance</h3>
              <p className="text-xs text-gray-500 mb-3">
                Remove orphan PDF properties when jobs were deleted manually.
              </p>
              <div className="flex flex-col items-start gap-4">
                <Button
                  variant="secondary"
                  onClick={handleCleanupProperties}
                  disabled={isCleaningProps}
                  className="w-full sm:w-auto"
                >
                  Clean PDF properties
                </Button>
                <div className="flex flex-col items-start gap-2 w-full">
                  <p className="text-xs text-gray-500">
                    Rebuilds Famileo fingerprints for existing articles to improve duplicate detection.
                  </p>
                  <Button
                    variant="secondary"
                    onClick={handleBackfillFingerprints}
                    disabled={isBackfilling}
                    className="w-full sm:w-auto"
                  >
                    Backfill Famileo fingerprints
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="bg-white border-t border-gray-200 p-4 sticky bottom-16">
        <div className="max-w-md mx-auto w-full flex justify-center">
          <Button
            onClick={handleSave}
            disabled={isSaving || isLoading || !isDirty}
            className="w-full sm:w-auto"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {isSaving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl px-6 py-5 flex flex-col items-center">
            <Spinner size="md" />
            <p className="mt-3 text-sm text-gray-700">Saving...</p>
          </div>
        </div>
      )}

      {isClearingLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl px-6 py-5 w-72">
            <div className="flex items-center justify-center">
              <Spinner size="md" />
            </div>
            <p className="mt-3 text-sm text-gray-700 text-center">Clearing logs...</p>
            <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-600 transition-all"
                style={{ width: `${clearProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {isCleaningProps && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl px-6 py-5 flex flex-col items-center">
            <Spinner size="md" />
            <p className="mt-3 text-sm text-gray-700">Cleaning properties...</p>
          </div>
        </div>
      )}
    </div>
  )
}
