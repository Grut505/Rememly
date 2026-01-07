import { useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useArticlesStore } from '../../state/articlesStore'
import { articlesApi } from '../../api/articles'
import { FloatingActionButton } from '../../ui/FloatingActionButton'
import { LoadingScreen, Spinner } from '../../ui/Spinner'
import { ErrorMessage } from '../../ui/ErrorMessage'
import { ArticleCard } from './ArticleCard'
import { EmptyState } from './EmptyState'
import { useAuth } from '../../auth/AuthContext'
import { getCurrentYear } from '../../utils/date'

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
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <button
          onClick={() => navigate('/stats')}
          className="text-gray-600 touch-manipulation"
        >
          ☰
        </button>
        <h1 className="text-lg font-semibold">Rememly {getCurrentYear()}</h1>
        <button
          onClick={() => navigate('/filters')}
          className="text-gray-600 touch-manipulation"
        >
          🔍
        </button>
      </header>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto">
        {articles.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {articles.map((article, index) => (
              <div
                key={article.id}
                ref={index === articles.length - 1 ? lastArticleRef : undefined}
              >
                <ArticleCard
                  article={article}
                  onClick={() => navigate(`/editor/${article.id}`)}
                />
              </div>
            ))}
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
