import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { articlesApi } from '../../api/articles'
import { Article } from '../../api/types'
import { Spinner } from '../../ui/Spinner'
import { ErrorMessage } from '../../ui/ErrorMessage'
import { MONTHS_EN } from '../../utils/constants'
import { getCurrentYear } from '../../utils/date'
import { AppHeader } from '../../ui/AppHeader'
import { useArticlesStore } from '../../state/articlesStore'

interface MonthStats {
  monthIndex: number
  monthName: string
  total: number
  active: number
  activeFamileo: number
  draft: number
  deleted: number
}

interface YearStats {
  year: number
  total: number
  active: number
  activeFamileo: number
  draft: number
  deleted: number
  months: MonthStats[]
}

export function Statistics() {
  const navigate = useNavigate()
  const setFilters = useArticlesStore((state) => state.setFilters)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [years, setYears] = useState<YearStats[]>([])
  const [selectedYear, setSelectedYear] = useState<number | null>(getCurrentYear())

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await articlesApi.list({
        limit: '1000',
        status_filter: 'all',
      })

      const yearMap = new Map<number, {
        total: number
        active: number
        activeFamileo: number
        draft: number
        deleted: number
        monthMap: Map<number, { total: number; active: number; activeFamileo: number; draft: number; deleted: number }>
      }>()

      response.items.forEach((article: Article) => {
        const date = new Date(article.date)
        const y = date.getFullYear()
        const m = date.getMonth()
        const status = article.status === 'DELETED' ? 'deleted' : article.status === 'DRAFT' ? 'draft' : 'active'
        const isFamileo = !!article.famileo_post_id

        if (!yearMap.has(y)) {
          yearMap.set(y, {
            total: 0,
            active: 0,
            activeFamileo: 0,
            draft: 0,
            deleted: 0,
            monthMap: new Map(),
          })
        }
        const yearStats = yearMap.get(y)!
        yearStats.total += 1
        yearStats[status] += 1
        if (status === 'active' && isFamileo) {
          yearStats.activeFamileo += 1
        }

        if (!yearStats.monthMap.has(m)) {
          yearStats.monthMap.set(m, { total: 0, active: 0, activeFamileo: 0, draft: 0, deleted: 0 })
        }
        const monthStats = yearStats.monthMap.get(m)!
        monthStats.total += 1
        monthStats[status] += 1
        if (status === 'active' && isFamileo) {
          monthStats.activeFamileo += 1
        }
      })

      const yearStatsList: YearStats[] = Array.from(yearMap.entries())
        .map(([y, stats]) => ({
          year: y,
          total: stats.total,
          active: stats.active,
          activeFamileo: stats.activeFamileo,
          draft: stats.draft,
          deleted: stats.deleted,
          months: Array.from(stats.monthMap.entries())
            .map(([m, mStats]) => ({
              monthIndex: m,
              monthName: MONTHS_EN[m],
              total: mStats.total,
              active: mStats.active,
              activeFamileo: mStats.activeFamileo,
              draft: mStats.draft,
              deleted: mStats.deleted,
            }))
            .sort((a, b) => a.monthIndex - b.monthIndex),
        }))
        .sort((a, b) => b.year - a.year)

      setYears(yearStatsList)
      if (yearStatsList.length > 0) {
        const currentYear = getCurrentYear()
        const hasCurrent = yearStatsList.some((y) => y.year === currentYear)
        setSelectedYear(hasCurrent ? currentYear : yearStatsList[0].year)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load statistics')
    } finally {
      setIsLoading(false)
    }
  }

  const openYear = (year: number, statusFilter: 'active' | 'draft' | 'deleted' | 'all' = 'active') => {
    setFilters({
      year: String(year),
      month: '',
      from: '',
      to: '',
      statusFilter,
      sourceFilter: 'all',
    })
    navigate('/')
  }

  const openMonth = (year: number, monthIndex: number, statusFilter: 'active' | 'draft' | 'deleted' | 'all' = 'active') => {
    setFilters({
      year: String(year),
      month: String(monthIndex + 1).padStart(2, '0'),
      from: '',
      to: '',
      statusFilter,
      sourceFilter: 'all',
    })
    navigate('/')
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <ErrorMessage message={error} onRetry={loadStats} />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />

      {/* Content */}
      <div className="flex-1 p-4 pb-24">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center">
              <Spinner size="lg" />
              <p className="mt-4 text-gray-600">Loading statistics...</p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm p-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Year breakdown
            </h2>

            <div className="space-y-3">
              {years.map((year) => {
                const isSelected = selectedYear === year.year
                return (
                  <div key={year.year} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="w-full px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-left hover:bg-gray-50">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedYear(isSelected ? null : year.year)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            setSelectedYear(isSelected ? null : year.year)
                          }
                        }}
                        className="flex-1 min-w-0"
                      >
                        <div className="text-base font-semibold text-gray-900">
                          {year.year}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {year.total} total • {year.active} active ({year.activeFamileo} famileo) • {year.draft} draft • {year.deleted} deleted
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => openYear(year.year, 'active')}
                          className="text-xs font-medium text-primary-600 hover:text-primary-700"
                        >
                          View active
                        </button>
                        <button
                          onClick={() => openYear(year.year, 'draft')}
                          className="text-xs font-medium text-amber-600 hover:text-amber-700"
                        >
                          View draft
                        </button>
                        <button
                          onClick={() => openYear(year.year, 'deleted')}
                          className="text-xs font-medium text-red-600 hover:text-red-700"
                        >
                          View deleted
                        </button>
                        <button
                          onClick={() => setSelectedYear(isSelected ? null : year.year)}
                          className="text-xs font-medium text-gray-600 hover:text-gray-800"
                        >
                          {isSelected ? 'Hide months' : 'Show months'}
                        </button>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="px-4 pb-3">
                        <div className="mt-2 space-y-2">
                          {year.months.map((month) => (
                            <div
                              key={`${year.year}-${month.monthIndex}`}
                              className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between py-2 border-b border-gray-100 last:border-b-0"
                            >
                              <div>
                                <div className="text-sm text-gray-900">
                                  {month.monthName}
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                  {month.total} total • {month.active} active ({month.activeFamileo} famileo) • {month.draft} draft • {month.deleted} deleted
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  onClick={() => openMonth(year.year, month.monthIndex, 'active')}
                                  className="text-xs font-medium text-primary-600 hover:text-primary-700"
                                >
                                  View active
                                </button>
                                <button
                                  onClick={() => openMonth(year.year, month.monthIndex, 'draft')}
                                  className="text-xs font-medium text-amber-600 hover:text-amber-700"
                                >
                                  View draft
                                </button>
                                <button
                                  onClick={() => openMonth(year.year, month.monthIndex, 'deleted')}
                                  className="text-xs font-medium text-red-600 hover:text-red-700"
                                >
                                  View deleted
                                </button>
                              </div>
                            </div>
                          ))}
                          {year.months.length === 0 && (
                            <div className="text-sm text-gray-500">No months found</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              {years.length === 0 && (
                <div className="text-sm text-gray-500">No statistics available</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
