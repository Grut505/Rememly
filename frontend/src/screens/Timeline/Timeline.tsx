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
import { getCurrentYear, getMonthYear, getMonthYearKey } from '../../utils/date'
import { CONSTANTS } from '../../utils/constants'
import { Modal } from '../../ui/Modal'
import { FiltersPanel, FilterValues } from '../Filters/FiltersPanel'

export function Timeline() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [showFiltersModal, setShowFiltersModal] = useState(false)
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
  }, [filters.year, filters.month, filters.from, filters.to, filters.statusFilter, addArticles, setError])

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

  // Check if filters are active (different from default)
  const hasActiveFilters =
    filters.year || // Any year filter is active (including "all years")
    filters.month ||
    filters.from ||
    filters.to ||
    (filters.statusFilter && filters.statusFilter !== 'active')

  // Convert store filters to FilterPanel format
  const currentFilterValues: FilterValues = {
    year: filters.year || '',
    month: filters.month || '',
    dateFrom: filters.from || '',
    dateTo: filters.to || '',
    statusFilter: filters.statusFilter || 'active',
  }

  useEffect(() => {
    console.log('Filters changed, reloading articles:', filters)
    loadArticles()
  }, [filters.year, filters.month, filters.from, filters.to, filters.statusFilter])

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
        <h2 className="text-lg font-semibold text-gray-900">{filters.year || 'All years'}</h2>
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
                    <ArticleCard article={article} onDeleted={handleArticleDeleted} />
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

      {/* FAB */}
      <FloatingActionButton onClick={() => navigate('/editor')} />

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
