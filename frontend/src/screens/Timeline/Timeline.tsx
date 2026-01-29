import { useEffect, useRef, useCallback, useState, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { useArticlesStore } from '../../state/articlesStore'
import { articlesApi } from '../../api/articles'
import { FloatingActionButton } from '../../ui/FloatingActionButton'
import { Spinner } from '../../ui/Spinner'
import { ErrorMessage } from '../../ui/ErrorMessage'
import { ArticleCard } from './ArticleCard'
import { ArticleRow } from './ArticleRow'
import { ArticleTile } from './ArticleTile'
import { EmptyState } from './EmptyState'
import { MonthSeparator } from './MonthSeparator'
import { AppHeader } from '../../ui/AppHeader'
import { useAuth } from '../../auth/AuthContext'
import { getMonthYear, getMonthYearKey } from '../../utils/date'
import { CONSTANTS } from '../../utils/constants'
import { Modal } from '../../ui/Modal'
import { FiltersPanel, FilterValues } from '../Filters/FiltersPanel'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { Switch } from '../../ui/Switch'
import { articlesService } from '../../services/articles.service'

export function Timeline() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [showFiltersModal, setShowFiltersModal] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [showPermanentDeleteConfirm, setShowPermanentDeleteConfirm] = useState(false)
  const [deleteProgress, setDeleteProgress] = useState<{ current: number; total: number } | null>(null)
  const [viewMode, setViewMode] = useState<'cards' | 'list' | 'mosaic'>(() => {
    const saved = localStorage.getItem('articles_view_mode')
    if (saved === 'list' || saved === 'mosaic') return saved
    return 'cards'
  })
  const [mosaicZoom, setMosaicZoom] = useState(2)
  const [isMobile, setIsMobile] = useState(false)
  const {
    articles,
    isLoading,
    error,
    cursor,
    hasMore,
    filters,
    setArticles,
    addArticles,
    setLoading,
    setError,
    setFilters,
  } = useArticlesStore()

  const observerRef = useRef<IntersectionObserver>()
  const loadingRef = useRef(false)
  const cursorRef = useRef<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const touchStartYRef = useRef<number | null>(null)
  const pullThreshold = 60

  // Keep refs in sync with state
  useEffect(() => {
    loadingRef.current = isLoading
  }, [isLoading])

  useEffect(() => {
    cursorRef.current = cursor
  }, [cursor])

  useEffect(() => {
    localStorage.setItem('articles_view_mode', viewMode)
  }, [viewMode])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)')
    const update = () => setIsMobile(media.matches)
    update()
    if (media.addEventListener) {
      media.addEventListener('change', update)
      return () => media.removeEventListener('change', update)
    }
    media.addListener(update)
    return () => media.removeListener(update)
  }, [])

  const loadArticles = async () => {
    setLoading(true)
    setError(null)

    console.log('Loading articles with filters:', filters)
    try {
      const response = await articlesApi.list({
        year: filters.year || undefined,
        month: filters.month,
        from: filters.from,
        to: filters.to,
        author: filters.author,
        limit: String(CONSTANTS.ARTICLES_PER_PAGE),
        status_filter: filters.statusFilter || 'active',
        source_filter: filters.sourceFilter || 'all',
      })
      console.log('Received articles:', response.items.length, 'cursor:', response.next_cursor)
      setArticles(response.items, response.next_cursor)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load articles')
    } finally {
      setLoading(false)
    }
  }

  const refreshArticles = useCallback(async () => {
    if (isLoading) return
    setIsRefreshing(true)
    await loadArticles()
    setIsRefreshing(false)
  }, [isLoading, loadArticles])

  const loadMore = useCallback(async () => {
    const currentCursor = cursorRef.current
    if (!currentCursor || loadingRef.current) return

    // Immediately set loading to prevent duplicate calls
    loadingRef.current = true
    setIsLoadingMore(true)
    console.log('loadMore called with cursor:', currentCursor)
    try {
      const response = await articlesApi.list({
        year: filters.year || undefined,
        month: filters.month,
        from: filters.from,
        to: filters.to,
        author: filters.author,
        cursor: currentCursor,
        limit: String(CONSTANTS.ARTICLES_PER_PAGE),
        status_filter: filters.statusFilter || 'active',
        source_filter: filters.sourceFilter || 'all',
      })
      console.log('Loaded more articles:', response.items.length, 'next cursor:', response.next_cursor)
      // Update cursorRef immediately to prevent duplicate requests
      cursorRef.current = response.next_cursor
      addArticles(response.items, response.next_cursor)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more')
    } finally {
      loadingRef.current = false
      setIsLoadingMore(false)
    }
  }, [filters.year, filters.month, filters.from, filters.to, filters.statusFilter, filters.sourceFilter, addArticles, setError])

  const sentinelRef = useCallback(
    (node: HTMLDivElement) => {
      if (observerRef.current) observerRef.current.disconnect()
      if (!node) return

      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !loadingRef.current && cursorRef.current) {
          console.log('Sentinel visible, loading more...')
          loadMore()
        }
      }, {
        threshold: 1.0, // Trigger only when sentinel is fully visible
        rootMargin: '0px'
      })

      observerRef.current.observe(node)
    },
    [loadMore]
  )

  const handleApplyFilters = (filterValues: FilterValues) => {
    console.log('Applying filters:', filterValues)
    // Clear articles first to show loading state
    setArticles([])
      setFilters({
        year: filterValues.year,
        month: filterValues.month,
        from: filterValues.dateFrom,
        to: filterValues.dateTo,
        author: filterValues.author,
        statusFilter: filterValues.statusFilter,
        sourceFilter: filterValues.sourceFilter,
      })
  }

  const handleArticleDeleted = (id: string) => {
    // If showing only active articles, remove from the list
    if (filters.statusFilter === 'active' || !filters.statusFilter) {
      useArticlesStore.getState().deleteArticle(id)
    } else {
      // Otherwise (all or deleted), update the article status locally
      const article = articles.find(a => a.id === id)
      if (article) {
        useArticlesStore.getState().updateArticle({ ...article, status: 'DELETED' })
      }
    }
  }

  const handleArticleRestored = (id: string) => {
    // If showing only deleted articles, remove from the list
    if (filters.statusFilter === 'deleted') {
      useArticlesStore.getState().deleteArticle(id)
    } else {
      // Otherwise (all or active), update the article status locally
      const article = articles.find(a => a.id === id)
      if (article) {
        useArticlesStore.getState().updateArticle({ ...article, status: 'ACTIVE' })
      }
    }
  }

  // Selection mode handlers
  const handleSelectionChange = (id: string, selected: boolean) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (selected) {
        newSet.add(id)
      } else {
        newSet.delete(id)
      }
      return newSet
    })
  }

  const handleSelectAll = () => {
    if (selectedIds.size === articles.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(articles.map(a => a.id)))
    }
  }

  const exitSelectionMode = () => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  const handleSelectionModeToggle = (enabled: boolean) => {
    setSelectionMode(enabled)
    if (!enabled) {
      setSelectedIds(new Set())
    }
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const scrollTop = document.scrollingElement?.scrollTop ?? window.scrollY
    if (scrollTop <= 0 && !isRefreshing && !isLoading) {
      touchStartYRef.current = e.touches[0].clientY
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartYRef.current === null || isRefreshing || isLoading) return
    const scrollTop = document.scrollingElement?.scrollTop ?? window.scrollY
    if (scrollTop > 0) {
      setPullDistance(0)
      touchStartYRef.current = null
      return
    }
    const delta = e.touches[0].clientY - touchStartYRef.current
    if (delta > 0) {
      setPullDistance(Math.min(delta, 80))
    } else {
      setPullDistance(0)
    }
  }

  const handleTouchEnd = () => {
    if (pullDistance >= pullThreshold && !isRefreshing && !isLoading) {
      refreshArticles()
    }
    setPullDistance(0)
    touchStartYRef.current = null
  }

  // Bulk soft delete (mark as DELETED)
  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    const ids = Array.from(selectedIds)
    setDeleteProgress({ current: 0, total: ids.length })
    try {
      for (let i = 0; i < ids.length; i++) {
        await articlesService.deleteArticle(ids[i])
        setDeleteProgress({ current: i + 1, total: ids.length })
      }
      // Remove from list or update status based on current filter
      if (filters.statusFilter === 'active' || !filters.statusFilter) {
        selectedIds.forEach(id => useArticlesStore.getState().deleteArticle(id))
      } else {
        selectedIds.forEach(id => {
          const article = articles.find(a => a.id === id)
          if (article) {
            useArticlesStore.getState().updateArticle({ ...article, status: 'DELETED' })
          }
        })
      }
      exitSelectionMode()
    } catch (err) {
      console.error('Bulk delete failed:', err)
    } finally {
      setBulkDeleting(false)
      setDeleteProgress(null)
      setShowBulkDeleteConfirm(false)
    }
  }

  // Bulk permanent delete (remove from sheet)
  const handleBulkPermanentDelete = async () => {
    setBulkDeleting(true)
    const ids = Array.from(selectedIds)
    setDeleteProgress({ current: 0, total: ids.length })
    try {
      for (let i = 0; i < ids.length; i++) {
        await articlesApi.permanentDelete(ids[i])
        setDeleteProgress({ current: i + 1, total: ids.length })
      }
      // Remove from list
      selectedIds.forEach(id => useArticlesStore.getState().deleteArticle(id))
      exitSelectionMode()
    } catch (err) {
      console.error('Bulk permanent delete failed:', err)
    } finally {
      setBulkDeleting(false)
      setDeleteProgress(null)
      setShowPermanentDeleteConfirm(false)
    }
  }

  // Check if we're viewing deleted articles
  const isViewingDeleted = filters.statusFilter === 'deleted'

  const monthCounts = articles.reduce<Record<string, number>>((acc, article) => {
    const key = getMonthYearKey(article.date)
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const monthGroups = articles.reduce<Array<{ key: string; label: string; items: typeof articles }>>((acc, article) => {
    const key = getMonthYearKey(article.date)
    const label = getMonthYear(article.date)
    const lastGroup = acc[acc.length - 1]
    if (!lastGroup || lastGroup.key !== key) {
      acc.push({ key, label, items: [article] })
    } else {
      lastGroup.items.push(article)
    }
    return acc
  }, [])

  const mosaicSizes = isMobile ? [96, 120, 150, 180] : [120, 160, 200, 240]
  const mosaicTileSize = mosaicSizes[Math.min(Math.max(mosaicZoom, 1), 4) - 1]
  const getMonthAccent = (key: string) => {
    let hash = 0
    for (let i = 0; i < key.length; i++) {
      hash = (hash * 31 + key.charCodeAt(i)) % 360
    }
    const hue = hash
    return {
      border: `hsl(${hue}, 35%, 70%)`,
      bg: `hsl(${hue}, 45%, 92%)`,
      text: `hsl(${hue}, 35%, 35%)`,
    }
  }

  const totalLoadedCount = articles.length
  const totalCountLabel = hasMore ? `${totalLoadedCount}+` : `${totalLoadedCount}`
  const lastLoadedMonthKey = articles.length > 0 ? getMonthYearKey(articles[articles.length - 1].date) : null

  // Check if filters are active (different from default)
  const hasActiveFilters =
    filters.year || // Any year filter is active (including "all years")
    filters.month ||
    filters.from ||
    filters.to ||
    filters.author ||
    (filters.statusFilter && filters.statusFilter !== 'active') ||
    (filters.sourceFilter && filters.sourceFilter !== 'all')

  // Convert store filters to FilterPanel format
  const currentFilterValues: FilterValues = {
    year: filters.year || '',
    month: filters.month || '',
    dateFrom: filters.from || '',
    dateTo: filters.to || '',
    author: filters.author || '',
    statusFilter: filters.statusFilter || 'active',
    sourceFilter: filters.sourceFilter || 'all',
  }

  useEffect(() => {
    console.log('Filters changed, reloading articles:', filters)
    loadArticles()
  }, [filters.year, filters.month, filters.from, filters.to, filters.author, filters.statusFilter, filters.sourceFilter])

  const headerDisabled = isLoading

  return (
    <div
      className="min-h-screen flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <AppHeader />

      {/* Year Header with Filter - Fixed */}
      <div className="bg-white border-b border-gray-300 px-4 py-3 flex items-center justify-between fixed top-[56px] left-0 right-0 z-[25] max-w-content mx-auto">
        <div className="min-w-0 flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900 truncate">
            {selectionMode ? `${selectedIds.size} selected` : (filters.year || 'All years')}
          </h2>
          {!selectionMode && (
            <span className="text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-full px-2 py-0.5">
              {totalCountLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {selectionMode ? (
            <button
              onClick={handleSelectAll}
              className={`touch-manipulation text-sm font-medium ${
                headerDisabled ? 'text-gray-400 cursor-not-allowed' : 'text-primary-600 hover:text-primary-700'
              }`}
              disabled={headerDisabled}
            >
              {selectedIds.size === articles.length ? 'Deselect all' : 'Select all'}
            </button>
          ) : (
            <>
              <div className="hidden sm:flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('cards')}
                  className={`px-2 py-1.5 text-xs font-medium transition-colors ${
                    viewMode === 'cards' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:text-gray-900'
                  }`}
                  title="Card view"
                >
                  Cards
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-2 py-1.5 text-xs font-medium transition-colors border-l border-gray-200 ${
                    viewMode === 'list' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:text-gray-900'
                  }`}
                  title="List view"
                >
                  List
                </button>
                <button
                  onClick={() => setViewMode('mosaic')}
                  className={`px-2 py-1.5 text-xs font-medium transition-colors border-l border-gray-200 ${
                    viewMode === 'mosaic' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:text-gray-900'
                  }`}
                  title="Mosaic view"
                >
                  Mosaic
                </button>
              </div>
              <div className="flex sm:hidden items-center bg-white border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('cards')}
                  className={`px-2 py-1.5 text-xs font-medium transition-colors ${
                    viewMode === 'cards' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:text-gray-900'
                  }`}
                  title="Card view"
                >
                  1
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-2 py-1.5 text-xs font-medium transition-colors border-l border-gray-200 ${
                    viewMode === 'list' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:text-gray-900'
                  }`}
                  title="List view"
                >
                  L
                </button>
                <button
                  onClick={() => setViewMode('mosaic')}
                  className={`px-2 py-1.5 text-xs font-medium transition-colors border-l border-gray-200 ${
                    viewMode === 'mosaic' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:text-gray-900'
                  }`}
                  title="Mosaic view"
                >
                  M
                </button>
              </div>
              {viewMode === 'mosaic' && (
                <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setMosaicZoom((z) => Math.max(1, z - 1))}
                    disabled={mosaicZoom <= 1}
                    className="px-2 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 disabled:opacity-40"
                    title="Zoom out"
                  >
                    −
                  </button>
                  <div className="px-2 py-1.5 text-xs text-gray-600 border-x border-gray-200">
                    {mosaicZoom}
                  </div>
                  <button
                    onClick={() => setMosaicZoom((z) => Math.min(4, z + 1))}
                    disabled={mosaicZoom >= 4}
                    className="px-2 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 disabled:opacity-40"
                    title="Zoom in"
                  >
                    +
                  </button>
                </div>
              )}
              <button
                onClick={refreshArticles}
                className={`touch-manipulation text-sm font-medium flex items-center gap-2 hidden sm:flex ${
                  headerDisabled ? 'text-gray-400 cursor-not-allowed' : 'text-primary-600 hover:text-primary-700'
                }`}
                disabled={headerDisabled}
              >
                <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                </svg>
                Refresh
              </button>
              <button
                onClick={() => setShowFiltersModal(true)}
                className={`touch-manipulation flex items-center gap-2 ${
                  headerDisabled
                    ? 'text-gray-400 cursor-not-allowed'
                    : hasActiveFilters
                      ? 'text-white bg-primary-600 hover:bg-primary-700 px-3 py-1.5 rounded-lg font-medium'
                      : 'text-primary-600 hover:text-primary-700'
                }`}
                disabled={headerDisabled}
              >
                <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                  <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
                </svg>
                Filter
                {hasActiveFilters && (
                  <span className="ml-1 bg-white text-primary-600 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    !
                  </span>
                )}
              </button>
            </>
          )}
          {articles.length > 0 && (
            <Switch
              checked={selectionMode}
              onChange={handleSelectionModeToggle}
              label="Select"
              disabled={headerDisabled}
            />
          )}
        </div>
      </div>

      {/* Spacer for fixed year header */}
      <div className="h-[36px]" />

      {/* Timeline */}
      <div className="flex-1 pb-20">
        {(pullDistance > 0 || isRefreshing) && (
          <div
            className="flex items-center justify-center"
            style={{ height: `${Math.max(pullDistance, 64)}px` }}
          >
            <div className="flex items-center gap-3 bg-white/80 backdrop-blur px-3 py-2 rounded-full shadow-sm border border-gray-200">
              <div className="relative w-6 h-6">
                <svg className="absolute inset-0 w-6 h-6 text-gray-200" viewBox="0 0 36 36">
                  <path
                    d="M18 2.0845
                       a 15.9155 15.9155 0 0 1 0 31.831
                       a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                </svg>
                <svg
                  className={`absolute inset-0 w-6 h-6 ${isRefreshing ? 'animate-spin text-primary-600' : 'text-primary-600'}`}
                  viewBox="0 0 36 36"
                  style={{
                    transform: `rotate(-90deg)`,
                    transformOrigin: '50% 50%',
                    strokeDasharray: `${Math.min(100, (pullDistance / pullThreshold) * 100)}, 100`,
                    transition: 'stroke-dasharray 120ms ease',
                  }}
                >
                  <path
                    d="M18 2.0845
                       a 15.9155 15.9155 0 0 1 0 31.831
                       a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
                <div className={`absolute inset-0 flex items-center justify-center transition-transform ${pullDistance >= pullThreshold ? 'rotate-180' : ''}`}>
                  <svg className={`w-3.5 h-3.5 ${isRefreshing ? 'hidden' : 'block'} text-primary-700`} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                    <path d="M12 5v14m0 0l-5-5m5 5l5-5"></path>
                  </svg>
                  <svg className={`w-3.5 h-3.5 ${isRefreshing ? 'block' : 'hidden'} text-primary-700`} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                    <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                  </svg>
                </div>
              </div>
              <span className="text-xs text-gray-600">
                {isRefreshing ? 'Refreshing...' : (pullDistance >= pullThreshold ? 'Release to refresh' : 'Pull to refresh')}
              </span>
            </div>
          </div>
        )}
        {isLoading && articles.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center">
              <Spinner size="lg" />
              <p className="mt-4 text-gray-600">Loading articles...</p>
            </div>
          </div>
        ) : error && articles.length === 0 ? (
          <div className="flex items-center justify-center p-6">
            <ErrorMessage message={error} onRetry={loadArticles} />
          </div>
        ) : articles.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {viewMode !== 'mosaic' && (
              <>
                {articles.map((article, index) => {
                  const currentMonthKey = getMonthYearKey(article.date)
                  const previousMonthKey =
                    index > 0 ? getMonthYearKey(articles[index - 1].date) : null
                  const showMonthSeparator = currentMonthKey !== previousMonthKey

                  return (
                    <Fragment key={article.id}>
                      {showMonthSeparator && (
                        <MonthSeparator
                          monthYear={getMonthYear(article.date)}
                          count={monthCounts[currentMonthKey] || 0}
                          showPlus={hasMore && lastLoadedMonthKey === currentMonthKey}
                        />
                      )}
                      <div className={`relative z-0 ${showMonthSeparator ? 'pt-8' : ''}`}>
                        {viewMode === 'cards' ? (
                          <ArticleCard
                            article={article}
                            onDeleted={handleArticleDeleted}
                            onRestored={handleArticleRestored}
                            selectionMode={selectionMode}
                            selected={selectedIds.has(article.id)}
                            onSelectionChange={handleSelectionChange}
                          />
                        ) : (
                          <ArticleRow
                            article={article}
                            onDeleted={handleArticleDeleted}
                            onRestored={handleArticleRestored}
                            selectionMode={selectionMode}
                            selected={selectedIds.has(article.id)}
                            onSelectionChange={handleSelectionChange}
                          />
                        )}
                      </div>
                    </Fragment>
                  )
                })}
              </>
            )}
            {viewMode === 'mosaic' && (
              <>
                {monthGroups.map((group, index) => {
                  const accent = getMonthAccent(group.key)
                  return (
                  <div key={group.key} className={`px-4 mb-8 ${index === 0 ? 'mt-8' : ''}`}>
                    <div className="mb-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-2 rounded-full flex-1"
                          style={{ backgroundColor: accent.border }}
                        />
                        <div
                          className="text-xs font-semibold px-2 py-1 rounded-full"
                          style={{ backgroundColor: accent.bg, color: accent.text }}
                        >
                          {group.label}
                        </div>
                        <div className="text-xs text-gray-500">{monthCounts[group.key] || group.items.length}</div>
                        <div
                          className="h-2 rounded-full flex-1"
                          style={{ backgroundColor: accent.border }}
                        />
                      </div>
                    </div>
                    <div
                      className="grid gap-4"
                      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${mosaicTileSize}px, 1fr))` }}
                    >
                      {group.items.map((article) => (
                        <ArticleTile
                          key={article.id}
                          article={article}
                          onDeleted={handleArticleDeleted}
                          onRestored={handleArticleRestored}
                          selectionMode={selectionMode}
                          selected={selectedIds.has(article.id)}
                          onSelectionChange={handleSelectionChange}
                        />
                      ))}
                    </div>
                    <div className="border-b border-gray-200 mt-6" />
                  </div>
                )})}
              </>
            )}

            {/* Sentinel element for infinite scroll */}
            {hasMore && !isLoadingMore && (
              <div ref={sentinelRef} className="h-4" />
            )}
          </>
        )}
      </div>

      {/* Loading spinner for pagination - fixed at bottom */}
      {isLoadingMore && (
        <div className="fixed bottom-24 left-0 right-0 flex justify-center z-50">
          <div className="bg-gray-100 shadow-lg rounded-full p-3 border border-gray-200">
            <Spinner />
          </div>
        </div>
      )}

      {/* Selection Mode Action Bar */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-300 p-4 z-50 shadow-lg">
          <div className="max-w-content mx-auto flex items-center justify-between gap-4">
            <span className="text-sm text-gray-600">
              {selectedIds.size} article{selectedIds.size > 1 ? 's' : ''} selected
            </span>
            <div className="flex gap-2">
              {isViewingDeleted ? (
                <button
                  onClick={() => setShowPermanentDeleteConfirm(true)}
                  disabled={bulkDeleting}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
                >
                  {bulkDeleting ? 'Deleting...' : 'Delete permanently'}
                </button>
              ) : (
                <button
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  disabled={bulkDeleting}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
                >
                  {bulkDeleting ? 'Deleting...' : 'Delete'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FAB - hide in selection mode */}
      {!selectionMode && (
        <div className="fixed bottom-20 left-0 right-0 z-50">
          <div className="max-w-content mx-auto px-4 flex justify-end">
            <FloatingActionButton
              onClick={() => navigate('/editor')}
              className="bg-primary-600 hover:bg-primary-700 active:bg-primary-800 transition-all hover:scale-105 active:scale-95"
              icon={
                <svg className="w-8 h-8" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                  <path d="M12 4v16m8-8H4"></path>
                </svg>
              }
            />
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation (soft delete) */}
      <ConfirmDialog
        isOpen={showBulkDeleteConfirm}
        title="Delete articles?"
        message={`${selectedIds.size} article${selectedIds.size > 1 ? 's' : ''} will be marked as deleted. You can find them later by enabling the 'Show deleted' filter.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleBulkDelete}
        onCancel={() => setShowBulkDeleteConfirm(false)}
        variant="danger"
        isLoading={bulkDeleting}
        progress={deleteProgress}
      />

      {/* Permanent Delete Confirmation */}
      <ConfirmDialog
        isOpen={showPermanentDeleteConfirm}
        title="Permanently delete articles?"
        message={`⚠️ WARNING: ${selectedIds.size} article${selectedIds.size > 1 ? 's' : ''} will be permanently removed from the database. This action cannot be undone!`}
        confirmLabel="Delete permanently"
        cancelLabel="Cancel"
        onConfirm={handleBulkPermanentDelete}
        onCancel={() => setShowPermanentDeleteConfirm(false)}
        variant="danger"
        isLoading={bulkDeleting}
        progress={deleteProgress}
      />

      {/* Filters Modal */}
      <Modal
        isOpen={showFiltersModal}
        onClose={() => setShowFiltersModal(false)}
        title="Filters"
      >
        <FiltersPanel
          initialFilters={currentFilterValues}
          onApply={handleApplyFilters}
          onClose={() => setShowFiltersModal(false)}
        />
      </Modal>
    </div>
  )
}
