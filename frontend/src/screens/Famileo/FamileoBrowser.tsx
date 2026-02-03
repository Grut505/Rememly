import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { AppHeader } from '../../ui/AppHeader'
import { famileoApi, FamileoPost, FamileoFamily } from '../../api/famileo'
import { usersApi, DeclaredUser } from '../../api/users'
import { FamileoPostCard } from './FamileoPostCard'
import { articlesService } from '../../services/articles.service'
import { useAuth } from '../../auth/AuthContext'

interface ImageCache {
  [postId: number]: { base64: string; mimeType: string }
}

interface BulkProgress {
  current: number
  total: number
  currentPostText: string
}

export function FamileoBrowser() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState(() => {
    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  })
  const [posts, setPosts] = useState<FamileoPost[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [imageCache, setImageCache] = useState<ImageCache>({})

  // Bulk create state
  const [bulkCreating, setBulkCreating] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null)
  const cancelBulkRef = useRef(false)
  const [bulkCanceling, setBulkCanceling] = useState(false)

  // Refresh session state
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null)
  const [autoRefreshing, setAutoRefreshing] = useState(false)

  // Families state
  const [families, setFamilies] = useState<FamileoFamily[]>([])
  const [authorFilter, setAuthorFilter] = useState<string>('declared')
  const [declaredUsers, setDeclaredUsers] = useState<DeclaredUser[]>([])
  const [viewMode, setViewMode] = useState<'card' | 'list' | 'mosaic'>(() => {
    const saved = localStorage.getItem('famileo_view_mode')
    return saved === 'list' || saved === 'mosaic' ? saved : 'card'
  })
  const [mosaicColumns, setMosaicColumns] = useState<number>(() => {
    const saved = Number(localStorage.getItem('famileo_mosaic_columns') || 2)
    return saved >= 2 && saved <= 4 ? saved : 2
  })
  const [selectedFamilyId, setSelectedFamilyId] = useState<string>('')
  const [loadingFamilies, setLoadingFamilies] = useState(true)
  const [authorCounts, setAuthorCounts] = useState<{ declared: number; others: number; total: number } | null>(null)

  // Imported posts filter state
  const [importedPostIds, setImportedPostIds] = useState<Set<string>>(new Set())
  const [importedFingerprints, setImportedFingerprints] = useState<Set<string>>(new Set())
  const [postFingerprints, setPostFingerprints] = useState<Record<number, string>>({})
  const [hashingPosts, setHashingPosts] = useState(false)

  const pageRef = useRef<HTMLDivElement>(null)
  const [hideImported, setHideImported] = useState(false)

  // Load families and imported IDs on mount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [familiesResponse, importedResponse, fingerprintsResponse, usersResponse] = await Promise.all([
          famileoApi.families(),
          famileoApi.importedIds(),
          famileoApi.importedFingerprints(),
          usersApi.list()
        ])
        setFamilies(familiesResponse.families)
        setDeclaredUsers(usersResponse.users || [])
        if (familiesResponse.families.length > 0) {
          setSelectedFamilyId(familiesResponse.families[0].famileo_id)
        }
        setImportedPostIds(new Set(importedResponse.ids))
        setImportedFingerprints(new Set(fingerprintsResponse.fingerprints || []))
      } catch (err) {
        console.error('Failed to load initial data:', err)
      } finally {
        setLoadingFamilies(false)
      }
    }
    loadInitialData()
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    requestAnimationFrame(() => {
      pageRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      requestAnimationFrame(() => {
        pageRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      })
    })
  }, [location.key])

  useEffect(() => {
    localStorage.setItem('famileo_view_mode', viewMode)
  }, [viewMode])

  useEffect(() => {
    localStorage.setItem('famileo_mosaic_columns', String(mosaicColumns))
  }, [mosaicColumns])

  const isSessionError = (message: string) => {
    const lower = message.toLowerCase()
    return (
      lower.includes('session expired') ||
      lower.includes('famileo session not configured') ||
      lower.includes('invalid famileo session')
    )
  }

  const sanitizeSessionError = (message: string) => {
    if (isSessionError(message)) {
      return 'Session Famileo expirée. Rafraîchissement en cours...'
    }
    return message
  }

  const waitForSessionValid = async () => {
    const maxAttempts = 20
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const status = await famileoApi.status({
          validate: 'true',
          family_id: selectedFamilyId || undefined,
        })
        if (status.valid) {
          // Clear refresh message once posts are available
          setRefreshMessage(null)
          return true
        }
        setRefreshMessage(status.message ? sanitizeSessionError(status.message) : 'Refreshing session...')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Refreshing session...'
        setRefreshMessage(sanitizeSessionError(msg))
      }
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
    return false
  }

  const fetchPosts = async (signal?: AbortSignal) => {
    const allPosts: FamileoPost[] = []
    let counts: { declared: number; others: number; total: number } | null = null
    let shouldContinue = true

    const startTs = new Date(startDate + 'T00:00:00').getTime()
    const endTs = new Date(endDate + 'T23:59:59').getTime()
    let timestamp: string | null = new Date(endDate + 'T23:59:59.999Z').toISOString()

    while (shouldContinue) {
      const response = await famileoApi.posts(
        {
          limit: '50',
          timestamp: timestamp,
          family_id: selectedFamilyId || undefined,
          author_filter: authorFilter,
        },
        { signal }
      )
      if (response.counts) {
        if (!counts) {
          counts = { declared: 0, others: 0, total: 0 }
        }
        counts.declared += response.counts.declared || 0
        counts.others += response.counts.others || 0
        counts.total += response.counts.total || 0
      }

      for (const post of response.posts) {
        const postTs = new Date(post.date).getTime()
        if (postTs >= startTs && postTs <= endTs) {
          allPosts.push(post)
        }
      }

      setHashingPosts(true)
      const hashes = await Promise.all(
        response.posts.map(async (post) => {
          const payload = buildFingerprintPayload(post)
          const hash = await hashFingerprint(payload)
          return [post.id, hash] as const
        })
      )
      setPostFingerprints((prev) => {
        const next = { ...prev }
        hashes.forEach(([id, hash]) => {
          if (hash) next[id] = hash
        })
        return next
      })
      setHashingPosts(false)

      if (response.next_timestamp) {
        const nextTs = new Date(response.next_timestamp).getTime()
        if (nextTs >= startTs) {
          timestamp = response.next_timestamp
        } else {
          shouldContinue = false
        }
      } else {
        shouldContinue = false
      }
    }

    if (counts) {
      setAuthorCounts(counts)
    }
    return allPosts
  }

  const handleGetPosts = async () => {
    if (!startDate || !endDate) {
      setError('Please select both start and end dates')
      return
    }

    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)
    setRefreshMessage(null)
    setPosts([])
    setSelectedIds(new Set())
    setImageCache({})
    setAuthorCounts(null)
    setPostFingerprints({})
    setHashingPosts(false)

    try {
      const allPosts = await fetchPosts(controller.signal)
      setPosts(allPosts)
      if (allPosts.length === 0) {
        setError('No posts found in this date range')
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setLoading(false)
        return
      }
      const message = err instanceof Error ? err.message : 'Failed to fetch posts'
      if (isSessionError(message) && !autoRefreshing) {
        setAutoRefreshing(true)
        setRefreshing(true)
        setRefreshMessage('Refreshing Famileo session... This may take a few minutes.')
        try {
          await famileoApi.triggerRefresh()
          const ok = await waitForSessionValid()
          if (ok) {
            const allPosts = await fetchPosts(controller.signal)
            setPosts(allPosts)
            if (allPosts.length === 0) {
              setError('No posts found in this date range')
            }
            setRefreshMessage(null)
          } else {
            setError('Le rafraîchissement Famileo a expiré. Réessaie dans quelques minutes.')
          }
        } catch (refreshErr) {
          const msg = refreshErr instanceof Error ? refreshErr.message : 'Failed to refresh session'
          setError(sanitizeSessionError(msg))
        } finally {
          setRefreshing(false)
          setAutoRefreshing(false)
        }
      } else {
        setError(message)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCancelGetPosts = () => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setLoading(false)
    setRefreshing(false)
    setAutoRefreshing(false)
    setRefreshMessage(null)
  }

  const handleSelectionChange = (postId: number, selected: boolean) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (selected) {
        newSet.add(postId)
      } else {
        newSet.delete(postId)
      }
      return newSet
    })
  }

  const handleImageLoaded = (postId: number, base64: string, mimeType: string) => {
    setImageCache(prev => ({
      ...prev,
      [postId]: { base64, mimeType }
    }))
  }

  const handleSelectAll = () => {
    const visiblePosts = posts.filter(post => !hideImported || !importedPostIds.has(String(post.id)))
    const visibleSelectedCount = visiblePosts.filter(post => selectedIds.has(post.id)).length
    if (visibleSelectedCount === visiblePosts.length) {
      // Deselect visible
      setSelectedIds(prev => {
        const next = new Set(prev)
        visiblePosts.forEach(post => next.delete(post.id))
        return next
      })
    } else {
      // Select visible
      setSelectedIds(prev => {
        const next = new Set(prev)
        visiblePosts.forEach(post => next.add(post.id))
        return next
      })
    }
  }

  const handleBulkCreate = async () => {
    if (!user || selectedIds.size === 0) return

    const selectedPosts = posts.filter(p => selectedIds.has(p.id))
    // Sort by date ascending (oldest first)
    selectedPosts.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    cancelBulkRef.current = false
    setBulkCreating(true)
    setBulkProgress({ current: 0, total: selectedPosts.length, currentPostText: '' })

    try {
      for (let i = 0; i < selectedPosts.length; i++) {
        if (cancelBulkRef.current) {
          break
        }
        const post = selectedPosts[i]
        setBulkProgress({
          current: i + 1,
          total: selectedPosts.length,
          currentPostText: post.text.substring(0, 50) + (post.text.length > 50 ? '...' : '')
        })

        // Get image from cache or fetch it
        let imageBase64 = ''
        let imageMimeType = 'image/jpeg'

        // Always fetch the full resolution image for article creation
        const imageResponse = await famileoApi.image(post.full_image_url)
        imageBase64 = imageResponse.base64
        imageMimeType = imageResponse.mimeType

        // Convert base64 to File
        const dataUrl = `data:${imageMimeType};base64,${imageBase64}`
        const blob = await fetch(dataUrl).then(r => r.blob())
        const file = new File([blob], 'famileo-import.jpg', { type: imageMimeType })

        // Convert Famileo date to ISO
        const parsedDate = new Date(post.date.replace(' ', 'T'))
        const dateModification = !isNaN(parsedDate.getTime())
          ? parsedDate.toISOString()
          : new Date().toISOString()

        // Create the article using author_email as persistent identifier
        await articlesService.createArticle(
          post.author_email || user.email,
          post.text,
          file,
          dateModification,
          String(post.id) // famileo_post_id
        )

        // Add to imported set so it shows as imported immediately
        setImportedPostIds(prev => new Set([...prev, String(post.id)]))
        let hash = postFingerprints[post.id]
        if (!hash) {
          hash = await hashFingerprint(buildFingerprintPayload(post))
        }
        if (hash) {
          setImportedFingerprints(prev => new Set([...prev, hash]))
        }

        // Small delay between creations to avoid overwhelming the API
        if (i < selectedPosts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }

      // Success - clear selection and show success message
      setSelectedIds(new Set())
      if (cancelBulkRef.current) {
        setRefreshMessage('Bulk creation cancelled.')
      } else {
        setRefreshMessage(`Successfully created ${selectedPosts.length} article${selectedPosts.length > 1 ? 's' : ''}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create articles')
    } finally {
      setBulkCreating(false)
      setBulkProgress(null)
      setBulkCanceling(false)
    }
  }

  const handleCancelBulkCreate = () => {
    cancelBulkRef.current = true
    setBulkCanceling(true)
  }

  const handleRefreshSession = async () => {
    setRefreshing(true)
    setRefreshMessage(null)
    setError(null)

    try {
      const response = await famileoApi.triggerRefresh()
      setRefreshMessage(response.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger refresh')
    } finally {
      setRefreshing(false)
    }
  }

  const selectedCount = selectedIds.size
  const normalizeFingerprintText = (value: string) => {
    return String(value || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  }
  const buildFingerprintPayload = (post: FamileoPost) => {
    const authorKey = normalizeFingerprintText(post.author_email || user?.email || '')
    const rawDate = post.date ? String(post.date) : ''
    const parsedDate = rawDate ? new Date(rawDate.replace(' ', 'T')) : new Date('')
    const dateKey = isNaN(parsedDate.getTime()) ? '' : parsedDate.toISOString().slice(0, 10)
    const textKey = normalizeFingerprintText(post.text || '')
    return `${authorKey}|${dateKey}|${textKey}`
  }
  const hashFingerprint = async (payload: string) => {
    if (!payload) return ''
    if (!window.crypto?.subtle) return ''
    const data = new TextEncoder().encode(payload)
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  const isAlreadyImported = (post: FamileoPost) => {
    const hash = postFingerprints[post.id]
    return importedPostIds.has(String(post.id)) || (!!hash && importedFingerprints.has(hash))
  }
  const visiblePosts = posts.filter(post => !hideImported || !isAlreadyImported(post))
  const visibleSelectedCount = visiblePosts.filter(post => selectedIds.has(post.id)).length

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />
      <div
        ref={pageRef}
        className={`flex-1 overflow-y-auto overflow-x-hidden ${!loading && posts.length === 0 ? 'overflow-hidden' : ''}`}
      >

      {/* Title - sticky under main header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Famileo Extractor</h2>
          <button
            onClick={handleRefreshSession}
            disabled={refreshing || bulkCreating}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation disabled:opacity-50"
            title="Refresh Famileo session"
          >
            <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            <span>{refreshing ? 'Refreshing...' : 'Refresh Session'}</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex flex-col gap-4">
          {/* Family selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Family
            </label>
            <select
              value={selectedFamilyId}
              onChange={(e) => setSelectedFamilyId(e.target.value)}
              disabled={loading || bulkCreating || loadingFamilies}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 text-gray-900 bg-white"
            >
              {loadingFamilies ? (
                <option value="">Loading families...</option>
              ) : families.length === 0 ? (
                <option value="">No family configured</option>
              ) : (
                families.map((family) => (
                  <option key={family.id} value={family.famileo_id}>
                    {family.name}
                  </option>
                ))
              )}
            </select>
          </div>
          {!loadingFamilies && families.length === 0 && (
            <div className="text-sm text-amber-600">
              No family configured. Add families in the "families" sheet.
            </div>
          )}

          {/* Date filters */}
          <div className="flex gap-2">
            <div className="flex-1 min-w-0">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={loading || bulkCreating}
                className="w-full px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 text-gray-900 bg-white appearance-none"
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={loading || bulkCreating}
                className="w-full px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 text-gray-900 bg-white appearance-none"
              />
            </div>
          </div>
          {/* Author filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Posts
            </label>
            <select
              value={authorFilter}
              onChange={(e) => setAuthorFilter(e.target.value)}
              disabled={loading || bulkCreating}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 text-gray-900 bg-white"
            >
              <option value="all">Everyone</option>
              <option value="others">Other users</option>
              <option value="declared">Declared users</option>
              {declaredUsers.length > 0 && (
                <optgroup label="Declared users (specific)">
                  {declaredUsers.map((user) => (
                    <option key={user.email} value={user.email}>
                      {user.pseudo || user.email}{user.famileo_name ? ` — ${user.famileo_name}` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <button
            onClick={handleGetPosts}
            disabled={loading || bulkCreating || loadingFamilies || !startDate || !endDate || (!selectedFamilyId && families.length > 0)}
            className="w-full py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors touch-manipulation"
          >
            {loadingFamilies ? 'Loading families...' : loading ? 'Loading...' : 'Get Posts'}
          </button>
        </div>
      </div>

      {/* Bulk create progress overlay */}
      {bulkCreating && bulkProgress && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 mx-4 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Creating Articles</h3>
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Progress</span>
                <span>{bulkProgress.current} / {bulkProgress.total}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-primary-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                ></div>
              </div>
            </div>
            <p className="text-sm text-gray-500 truncate">
              {bulkProgress.currentPostText}
            </p>
            <button
              onClick={handleCancelBulkCreate}
              disabled={bulkCanceling}
              className="mt-4 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-60 rounded-lg transition-colors"
            >
              {bulkCanceling ? 'Cancel in progress...' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

      {/* Refresh success message */}
      {refreshMessage && (
        <div className="mx-4 mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {refreshMessage}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-10">
          <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
          <p className="mt-3 text-sm text-gray-600">Loading posts...</p>
          <button
            onClick={handleCancelGetPosts}
            className="mt-4 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Posts list */}
      {!loading && posts.length > 0 && (
        <div className="flex-1 py-4 pb-24">
          {/* Selection controls */}
          <div className="px-4 mb-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {posts.length} post{posts.length > 1 ? 's' : ''} found
                {selectedCount > 0 && (
                  <span className="ml-2 text-primary-600 font-medium">
                    ({selectedCount} selected)
                  </span>
                )}
                {hashingPosts && (
                  <span className="ml-2 text-gray-400">
                    • hashing…
                  </span>
                )}
                {authorCounts && (
                  <span className="ml-2 text-gray-400">
                    • {authorCounts.declared} declared / {authorCounts.others} others
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={viewMode}
                  onChange={(e) => setViewMode(e.target.value as 'card' | 'list' | 'mosaic')}
                  className="px-2 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg"
                  aria-label="View mode"
                >
                  <option value="card">Card view</option>
                  <option value="list">List view</option>
                  <option value="mosaic">Mosaic view</option>
                </select>
                {viewMode === 'mosaic' && (
                  <select
                    value={mosaicColumns}
                    onChange={(e) => setMosaicColumns(Number(e.target.value))}
                    className="px-2 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg"
                    aria-label="Mosaic columns"
                  >
                    <option value={2}>2 cols</option>
                    <option value={3}>3 cols</option>
                    <option value={4}>4 cols</option>
                  </select>
                )}
                <button
                  onClick={handleSelectAll}
                  disabled={bulkCreating}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  {visibleSelectedCount === visiblePosts.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
            </div>
          {/* Hide imported toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="hideImported"
              checked={hideImported}
              onChange={(e) => setHideImported(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <label htmlFor="hideImported" className="text-sm text-gray-600">
                Hide already imported posts ({posts.filter(p => isAlreadyImported(p)).length})
            </label>
          </div>
          </div>
          {viewMode === 'mosaic' ? (
            <div
              className="px-4 grid gap-3"
              style={{ gridTemplateColumns: `repeat(${mosaicColumns}, minmax(0, 1fr))` }}
            >
              {posts
                .filter(post => !hideImported || !isAlreadyImported(post))
                .map((post) => (
                <FamileoPostCard
                  key={post.id}
                  post={post}
                  selected={selectedIds.has(post.id)}
                  onSelectionChange={(selected) => handleSelectionChange(post.id, selected)}
                  onImageLoaded={handleImageLoaded}
                  cachedImage={imageCache[post.id]}
                  alreadyImported={isAlreadyImported(post)}
                  variant="mosaic"
                />
              ))}
            </div>
          ) : viewMode === 'list' ? (
            <div className="space-y-3">
              {posts
                .filter(post => !hideImported || !isAlreadyImported(post))
                .map((post) => (
                <FamileoPostCard
                  key={post.id}
                  post={post}
                  selected={selectedIds.has(post.id)}
                  onSelectionChange={(selected) => handleSelectionChange(post.id, selected)}
                  onImageLoaded={handleImageLoaded}
                  cachedImage={imageCache[post.id]}
                  alreadyImported={isAlreadyImported(post)}
                  variant="row"
                />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {posts
                .filter(post => !hideImported || !isAlreadyImported(post))
                .map((post) => (
                <FamileoPostCard
                  key={post.id}
                  post={post}
                  selected={selectedIds.has(post.id)}
                  onSelectionChange={(selected) => handleSelectionChange(post.id, selected)}
                  onImageLoaded={handleImageLoaded}
                  cachedImage={imageCache[post.id]}
                  alreadyImported={isAlreadyImported(post)}
                  variant="card"
                />
              ))}
            </div>
          )}
        </div>
      )}

      </div>

      {/* Bulk create button - fixed at bottom */}
      {!loading && posts.length > 0 && (
        <div className={`fixed bottom-16 left-0 right-0 bg-white border-t border-gray-200 p-4 z-40 ${bulkCreating ? 'pointer-events-none' : ''}`}>
          <div className="max-w-content mx-auto">
            <button
              onClick={handleBulkCreate}
              disabled={selectedCount === 0 || bulkCreating}
              className="w-full py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors touch-manipulation flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M12 4v16m8-8H4"></path>
              </svg>
              {selectedCount > 0 ? `Bulk Create (${selectedCount})` : 'Select posts to create'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
