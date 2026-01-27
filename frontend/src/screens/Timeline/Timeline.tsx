import { useEffect, useRef, useCallback, useState, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { useArticlesStore } from '../../state/articlesStore'
import { articlesApi } from '../../api/articles'
import { FloatingActionButton } from '../../ui/FloatingActionButton'
import { LoadingScreen, Spinner } from '../../ui/Spinner'
import { ErrorMessage } from '../../ui/ErrorMessage'
import { ArticleCard } from './ArticleCard'
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

  // Keep refs in sync with state
  useEffect(() => {
    loadingRef.current = isLoading
  }, [isLoading])

  useEffect(() => {
    cursorRef.current = cursor
  }, [cursor])

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

  // Check if filters are active (different from default)
  const hasActiveFilters =
    filters.year || // Any year filter is active (including "all years")
    filters.month ||
    filters.from ||
    filters.to ||
    (filters.statusFilter && filters.statusFilter !== 'active') ||
    (filters.sourceFilter && filters.sourceFilter !== 'all')

  // Convert store filters to FilterPanel format
  const currentFilterValues: FilterValues = {
    year: filters.year || '',
    month: filters.month || '',
    dateFrom: filters.from || '',
    dateTo: filters.to || '',
    statusFilter: filters.statusFilter || 'active',
    sourceFilter: filters.sourceFilter || 'all',
  }

  useEffect(() => {
    console.log('Filters changed, reloading articles:', filters)
    loadArticles()
  }, [filters.year, filters.month, filters.from, filters.to, filters.statusFilter, filters.sourceFilter])

  if (isLoading && articles.length === 0) {
    return <LoadingScreen message="Loading articles..." />
  }

  if (error && articles.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <ErrorMessage message={error} onRetry={loadArticles} />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />

      {/* Year Header with Filter - Fixed */}
      <div className="bg-white border-b border-gray-300 px-4 py-3 flex items-center justify-between fixed top-[56px] left-0 right-0 z-[25] max-w-content mx-auto">
        <h2 className="text-lg font-semibold text-gray-900">
          {selectionMode ? `${selectedIds.size} selected` : (filters.year || 'All years')}
        </h2>
        <div className="flex items-center gap-4">
          {selectionMode ? (
            <button
              onClick={handleSelectAll}
              className="text-primary-600 hover:text-primary-700 touch-manipulation text-sm font-medium"
            >
              {selectedIds.size === articles.length ? 'Deselect all' : 'Select all'}
            </button>
          ) : (
            <button
              onClick={() => setShowFiltersModal(true)}
              className={`touch-manipulation flex items-center gap-2 ${
                hasActiveFilters
                  ? 'text-white bg-primary-600 hover:bg-primary-700 px-3 py-1.5 rounded-lg font-medium'
                  : 'text-primary-600 hover:text-primary-700'
              }`}
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
          )}
          {articles.length > 0 && (
            <Switch
              checked={selectionMode}
              onChange={handleSelectionModeToggle}
              label="Select"
            />
          )}
        </div>
      </div>

      {/* Spacer for fixed year header */}
      <div className="h-[36px]" />

      {/* Timeline */}
      <div className="flex-1 pb-20">
        {articles.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {articles.map((article, index) => {
              const currentMonthKey = getMonthYearKey(article.date)
              const previousMonthKey =
                index > 0 ? getMonthYearKey(articles[index - 1].date) : null
              const showMonthSeparator = currentMonthKey !== previousMonthKey

              return (
                <Fragment key={article.id}>
                  {showMonthSeparator && (
                    <MonthSeparator monthYear={getMonthYear(article.date)} />
                  )}
                  <div className={`relative z-0 ${showMonthSeparator ? 'pt-8' : ''}`}>
                    <ArticleCard
                      article={article}
                      onDeleted={handleArticleDeleted}
                      onRestored={handleArticleRestored}
                      selectionMode={selectionMode}
                      selected={selectedIds.has(article.id)}
                      onSelectionChange={handleSelectionChange}
                    />
                  </div>
                </Fragment>
              )
            })}

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
        <div className="fixed bottom-6 left-0 right-0 z-50">
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
