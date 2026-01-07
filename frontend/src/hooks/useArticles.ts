import { useArticlesStore } from '../state/articlesStore'

export function useArticles() {
  const articles = useArticlesStore((state) => state.articles)
  const isLoading = useArticlesStore((state) => state.isLoading)
  const error = useArticlesStore((state) => state.error)
  const hasMore = useArticlesStore((state) => state.hasMore)

  return {
    articles,
    isLoading,
    error,
    hasMore,
  }
}
