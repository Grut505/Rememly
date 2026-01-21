import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppHeader } from '../../ui/AppHeader'
import { famileoApi, FamileoPost, FamileoFamily } from '../../api/famileo'
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
  const navigate = useNavigate()
  const { user } = useAuth()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [posts, setPosts] = useState<FamileoPost[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [imageCache, setImageCache] = useState<ImageCache>({})

  // Bulk create state
  const [bulkCreating, setBulkCreating] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null)

  // Refresh session state
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null)

  // Families state
  const [families, setFamilies] = useState<FamileoFamily[]>([])
  const [selectedFamilyId, setSelectedFamilyId] = useState<string>('')
  const [loadingFamilies, setLoadingFamilies] = useState(true)

  // Imported posts filter state
  const [importedPostIds, setImportedPostIds] = useState<Set<string>>(new Set())
  const [hideImported, setHideImported] = useState(false)

  // Load families and imported IDs on mount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [familiesResponse, importedResponse] = await Promise.all([
          famileoApi.families(),
          famileoApi.importedIds()
        ])
        setFamilies(familiesResponse.families)
        if (familiesResponse.families.length > 0) {
          setSelectedFamilyId(familiesResponse.families[0].famileo_id)
        }
        setImportedPostIds(new Set(importedResponse.ids))
      } catch (err) {
        console.error('Failed to load initial data:', err)
      } finally {
        setLoadingFamilies(false)
      }
    }
    loadInitialData()
  }, [])

  const handleGetPosts = async () => {
    if (!startDate || !endDate) {
      setError('Please select both start and end dates')
      return
    }

    setLoading(true)
    setError(null)
    setPosts([])
    setSelectedIds(new Set())
    setImageCache({})

    try {
      const allPosts: FamileoPost[] = []
      let shouldContinue = true

      // Convert dates to timestamps for comparison
      const startTs = new Date(startDate + 'T00:00:00').getTime()
      const endTs = new Date(endDate + 'T23:59:59').getTime()

      // Start from end date (most recent) and paginate backwards
      // First call: get posts before end date + 1 day to include end date posts
      let timestamp: string | null = new Date(endDate + 'T23:59:59.999Z').toISOString()

      console.log('Famileo fetch - startDate:', startDate, 'endDate:', endDate)
      console.log('Famileo fetch - startTs:', new Date(startTs).toISOString(), 'endTs:', new Date(endTs).toISOString())
      console.log('Famileo fetch - initial timestamp:', timestamp)

      while (shouldContinue) {
        console.log('Famileo fetch - calling API with timestamp:', timestamp)
        const response = await famileoApi.posts({
          limit: '50',
          timestamp: timestamp,
          family_id: selectedFamilyId || undefined,
        })
        console.log('Famileo fetch - got', response.posts.length, 'posts, has_more:', response.has_more, 'next_timestamp:', response.next_timestamp)

        // Add posts that are within the date range
        for (const post of response.posts) {
          const postTs = new Date(post.date).getTime()
          if (postTs >= startTs && postTs <= endTs) {
            allPosts.push(post)
          }
        }

        // Check if we should continue pagination
        // Continue if: next_timestamp exists AND is >= startDate
        if (response.next_timestamp) {
          const nextTs = new Date(response.next_timestamp).getTime()
          console.log('Famileo fetch - nextTs:', new Date(nextTs).toISOString(), 'startTs:', new Date(startTs).toISOString(), 'continue?', nextTs >= startTs)
          if (nextTs >= startTs) {
            timestamp = response.next_timestamp
          } else {
            // Next page would be before start date, stop
            console.log('Famileo fetch - stopping, next page before start date')
            shouldContinue = false
          }
        } else {
          // No next_timestamp means no more pages
          console.log('Famileo fetch - stopping, no next_timestamp')
          shouldContinue = false
        }
      }

      setPosts(allPosts)

      if (allPosts.length === 0) {
        setError('No posts found in this date range')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch posts')
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    navigate('/')
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
    if (selectedIds.size === posts.length) {
      // Deselect all
      setSelectedIds(new Set())
    } else {
      // Select all
      setSelectedIds(new Set(posts.map(p => p.id)))
    }
  }

  const handleBulkCreate = async () => {
    if (!user || selectedIds.size === 0) return

    const selectedPosts = posts.filter(p => selectedIds.has(p.id))
    // Sort by date ascending (oldest first)
    selectedPosts.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    setBulkCreating(true)
    setBulkProgress({ current: 0, total: selectedPosts.length, currentPostText: '' })

    try {
      for (let i = 0; i < selectedPosts.length; i++) {
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
          post.author_email,
          post.text,
          file,
          dateModification,
          String(post.id) // famileo_post_id
        )

        // Add to imported set so it shows as imported immediately
        setImportedPostIds(prev => new Set([...prev, String(post.id)]))

        // Small delay between creations to avoid overwhelming the API
        if (i < selectedPosts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }

      // Success - clear selection and show success message
      setSelectedIds(new Set())
      setRefreshMessage(`Successfully created ${selectedPosts.length} article${selectedPosts.length > 1 ? 's' : ''}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create articles')
    } finally {
      setBulkCreating(false)
      setBulkProgress(null)
    }
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

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />

      {/* Back button and title - sticky under main header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-14 z-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="p-2 -ml-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
              disabled={bulkCreating}
            >
              <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M15 19l-7-7 7-7"></path>
              </svg>
            </button>
            <h2 className="text-lg font-semibold text-gray-900">Famileo Scraper</h2>
          </div>
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
          {families.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Famille
              </label>
              <select
                value={selectedFamilyId}
                onChange={(e) => setSelectedFamilyId(e.target.value)}
                disabled={loading || bulkCreating || loadingFamilies}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 text-gray-900 bg-white"
              >
                {families.map((family) => (
                  <option key={family.id} value={family.famileo_id}>
                    {family.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {loadingFamilies && (
            <div className="text-sm text-gray-500">Chargement des familles...</div>
          )}
          {!loadingFamilies && families.length === 0 && (
            <div className="text-sm text-amber-600">
              Aucune famille configurée. Ajoutez des familles dans la sheet "families".
            </div>
          )}

          {/* Date filters */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="flex-1 min-w-0">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={loading || bulkCreating}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 text-gray-900 bg-white appearance-none"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 text-gray-900 bg-white appearance-none"
              />
            </div>
          </div>
          <button
            onClick={handleGetPosts}
            disabled={loading || bulkCreating || !startDate || !endDate || (!selectedFamilyId && families.length > 0)}
            className="w-full py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors touch-manipulation"
          >
            {loading ? 'Loading...' : 'Get Posts'}
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

      {/* Loading spinner */}
      {loading && (
        <div className="flex-1 flex items-center justify-center py-12">
          <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
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
              </div>
              <button
                onClick={handleSelectAll}
                disabled={bulkCreating}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                {selectedIds.size === posts.length ? 'Deselect All' : 'Select All'}
              </button>
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
                Masquer les posts déjà importés ({posts.filter(p => importedPostIds.has(String(p.id))).length})
              </label>
            </div>
          </div>
          <div className="space-y-4">
            {posts
              .filter(post => !hideImported || !importedPostIds.has(String(post.id)))
              .map((post) => (
              <FamileoPostCard
                key={post.id}
                post={post}
                selected={selectedIds.has(post.id)}
                onSelectionChange={(selected) => handleSelectionChange(post.id, selected)}
                onImageLoaded={handleImageLoaded}
                cachedImage={imageCache[post.id]}
                alreadyImported={importedPostIds.has(String(post.id))}
              />
            ))}
          </div>
        </div>
      )}

      {/* Bulk create button - fixed at bottom */}
      {!loading && posts.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-20">
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
