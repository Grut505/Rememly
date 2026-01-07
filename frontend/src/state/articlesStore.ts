import { create } from 'zustand'
import { Article } from '../api/types'

interface ArticlesState {
  articles: Article[]
  isLoading: boolean
  error: string | null
  cursor: string | null
  hasMore: boolean
  setArticles: (articles: Article[]) => void
  addArticles: (articles: Article[], cursor: string | null) => void
  updateArticle: (article: Article) => void
  setLoading: (isLoading: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

export const useArticlesStore = create<ArticlesState>((set) => ({
  articles: [],
  isLoading: false,
  error: null,
  cursor: null,
  hasMore: true,

  setArticles: (articles) =>
    set({ articles, cursor: null, hasMore: true }),

  addArticles: (articles, cursor) =>
    set((state) => ({
      articles: [...state.articles, ...articles],
      cursor,
      hasMore: cursor !== null,
    })),

  updateArticle: (article) =>
    set((state) => ({
      articles: state.articles.map((a) =>
        a.id === article.id ? article : a
      ),
    })),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  reset: () =>
    set({
      articles: [],
      isLoading: false,
      error: null,
      cursor: null,
      hasMore: true,
    }),
}))
