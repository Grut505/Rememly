import { create } from 'zustand'
import { Article } from '../api/types'
import { StatusFilter, SourceFilter } from '../screens/Filters/FiltersPanel'

export interface ArticleFilters {
  year?: string
  month?: string
  from?: string
  to?: string
  author?: string
  statusFilter?: StatusFilter
  sourceFilter?: SourceFilter
}

const defaultFilters: ArticleFilters = {
  year: '',  // Empty = all years
  month: '',
  from: '',
  to: '',
  author: '',
  statusFilter: 'active',
  sourceFilter: 'all',
}

interface ArticlesState {
  articles: Article[]
  isLoading: boolean
  error: string | null
  cursor: string | null
  hasMore: boolean
  filters: ArticleFilters
  setArticles: (articles: Article[], cursor?: string | null) => void
  addArticles: (articles: Article[], cursor: string | null) => void
  updateArticle: (article: Article) => void
  deleteArticle: (id: string) => void
  setLoading: (isLoading: boolean) => void
  setError: (error: string | null) => void
  setFilters: (filters: ArticleFilters) => void
  reset: () => void
}

export const useArticlesStore = create<ArticlesState>((set) => ({
  articles: [],
  isLoading: false,
  error: null,
  cursor: null,
  hasMore: true,
  filters: defaultFilters,

  setArticles: (articles, cursor = null) => {
    // Remove duplicates based on id
    const seen = new Set<string>()
    const uniqueArticles = articles.filter(a => {
      if (seen.has(a.id)) return false
      seen.add(a.id)
      return true
    })
    return set({ articles: uniqueArticles, cursor, hasMore: cursor !== null })
  },

  addArticles: (articles, cursor) =>
    set((state) => {
      // Filter out duplicates based on id
      const existingIds = new Set(state.articles.map(a => a.id))
      const newArticles = articles.filter(a => !existingIds.has(a.id))
      return {
        articles: [...state.articles, ...newArticles],
        cursor,
        hasMore: cursor !== null,
      }
    }),

  updateArticle: (article) =>
    set((state) => ({
      articles: state.articles.map((a) =>
        a.id === article.id ? article : a
      ),
    })),

  deleteArticle: (id) =>
    set((state) => ({
      articles: state.articles.filter((a) => a.id !== id),
    })),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  setFilters: (filters) => set({ filters }),

  reset: () =>
    set({
      articles: [],
      isLoading: false,
      error: null,
      cursor: null,
      hasMore: true,
      filters: defaultFilters,
    }),
}))
