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

export function Timeline() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const {
    articles,
    isLoading,
    error,
    cursor,
    hasMore,
    setArticles,
    addArticles,
    setLoading,
    setError,
  } = useArticlesStore()

  const observerRef = useRef<IntersectionObserver>()
  const lastArticleRef = useCallback(
    (node: HTMLDivElement) => {
      if (isLoading) return
      if (observerRef.current) observerRef.current.disconnect()

      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          loadMore()
        }
      })

      if (node) observerRef.current.observe(node)
    },
    [isLoading, hasMore]
  )

  const loadArticles = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await articlesApi.list({
        year: getCurrentYear().toString(),
        limit: '20',
      })
      setArticles(response.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load articles')
    } finally {
      setLoading(false)
    }
  }

  const loadMore = async () => {
    if (!cursor || isLoading) return

    setLoading(true)
    try {
      const response = await articlesApi.list({
        cursor,
        limit: '20',
      })
      addArticles(response.items, response.next_cursor)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadArticles()
  }, [])

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

      {/* Year Header with Filter */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-[60px] z-10">
        <h2 className="text-lg font-semibold text-gray-900">{getCurrentYear()}</h2>
        <button
          onClick={() => navigate('/filters')}
          className="text-primary-600 hover:text-primary-700 touch-manipulation flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
            <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
          </svg>
          Filter
        </button>
      </div>

      {/* Timeline */}
      <div className="flex-1 pb-20">
        {articles.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {articles.map((article, index) => {
              const currentMonthKey = getMonthYearKey(article.date_modification)
              const previousMonthKey =
                index > 0 ? getMonthYearKey(articles[index - 1].date_modification) : null
              const showMonthSeparator = currentMonthKey !== previousMonthKey

              return (
                <Fragment key={article.id}>
                  {showMonthSeparator && (
                    <MonthSeparator monthYear={getMonthYear(article.date_modification)} />
                  )}
                  <div
                    ref={index === articles.length - 1 ? lastArticleRef : undefined}
                    className={`relative z-0 ${showMonthSeparator ? 'pt-4' : ''}`}
                  >
                    <ArticleCard article={article} />
                  </div>
                </Fragment>
              )
            })}
            {isLoading && (
              <div className="flex justify-center py-4">
                <Spinner />
              </div>
            )}
          </>
        )}
      </div>

      {/* FAB */}
      <FloatingActionButton onClick={() => navigate('/editor')} />
    </div>
  )
}
