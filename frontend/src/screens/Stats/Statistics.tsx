import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { articlesApi } from '../../api/articles'
import { Article } from '../../api/types'
import { LoadingScreen } from '../../ui/Spinner'
import { ErrorMessage } from '../../ui/ErrorMessage'
import { MONTHS_FR } from '../../utils/constants'
import { getCurrentYear } from '../../utils/date'

interface MonthStats {
  month: string
  count: number
}

export function Statistics() {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [yearStats, setYearStats] = useState<MonthStats[]>([])
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const year = getCurrentYear()
      const response = await articlesApi.list({
        year: year.toString(),
        limit: '1000',
      })

      // Group by month
      const monthCounts: Record<number, number> = {}
      response.items.forEach((article: Article) => {
        const month = new Date(article.date_modification).getMonth()
        monthCounts[month] = (monthCounts[month] || 0) + 1
      })

      const stats: MonthStats[] = MONTHS_FR.map((monthName, index) => ({
        month: monthName,
        count: monthCounts[index] || 0,
      }))

      setYearStats(stats)
      setTotalCount(response.items.length)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load statistics')
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return <LoadingScreen message="Loading statistics..." />
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <ErrorMessage message={error} onRetry={loadStats} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center">
        <button
          onClick={() => navigate('/')}
          className="text-gray-600 touch-manipulation"
        >
          ← Back
        </button>
        <h1 className="text-lg font-semibold ml-4">Statistics</h1>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            {getCurrentYear()}
          </h2>

          <div className="space-y-2 mb-6">
            {yearStats.map((stat) => (
              <div
                key={stat.month}
                className="flex justify-between items-center py-2 border-b border-gray-100"
              >
                <span className="text-gray-700">{stat.month}</span>
                <span className="font-semibold text-gray-900">
                  {stat.count}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t-2 border-gray-200 flex justify-between items-center">
            <span className="text-lg font-semibold text-gray-900">Total</span>
            <span className="text-2xl font-bold text-blue-600">
              {totalCount} articles
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
