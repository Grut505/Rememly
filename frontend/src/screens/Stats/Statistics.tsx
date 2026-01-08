import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { articlesApi } from '../../api/articles'
import { Article } from '../../api/types'
import { LoadingScreen } from '../../ui/Spinner'
import { ErrorMessage } from '../../ui/ErrorMessage'
import { Button } from '../../ui/Button'
import { MONTHS_FR } from '../../utils/constants'
import { getCurrentYear } from '../../utils/date'
import { pdfService } from '../../services/pdf.service'
import { useUiStore } from '../../state/uiStore'

interface MonthStats {
  month: string
  count: number
}

export function Statistics() {
  const navigate = useNavigate()
  const { showToast } = useUiStore()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [yearStats, setYearStats] = useState<MonthStats[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const [pdfProgress, setPdfProgress] = useState(0)

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

  const handleGeneratePdf = async () => {
    setIsGeneratingPdf(true)
    setPdfProgress(0)

    try {
      const year = getCurrentYear()
      const from = `${year}-01-01`
      const to = `${year}-12-31`

      // Create PDF job
      const jobId = await pdfService.createPdf(from, to)

      // Poll for completion
      const result = await pdfService.pollJobStatus(jobId, (job) => {
        setPdfProgress(job.progress)
      })

      if (result.pdf_url) {
        showToast('PDF generated successfully!', 'success')
        window.open(result.pdf_url, '_blank')
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Failed to generate PDF',
        'error'
      )
    } finally {
      setIsGeneratingPdf(false)
      setPdfProgress(0)
    }
  }

  if (isLoading) {
    return <LoadingScreen message="Loading statistics..." />
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
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center sticky top-0 z-10">
        <button
          onClick={() => navigate('/')}
          className="text-gray-600 touch-manipulation"
        >
          ← Back
        </button>
        <h1 className="text-lg font-semibold ml-4">Statistics</h1>
      </header>

      {/* Content */}
      <div className="flex-1 p-4 pb-20">
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

        {/* PDF Generation */}
        <div className="bg-white rounded-lg shadow-sm p-4 mt-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Export to PDF
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Generate a PDF document with all articles from {getCurrentYear()}
          </p>

          {isGeneratingPdf && (
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Generating PDF...</span>
                <span>{pdfProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${pdfProgress}%` }}
                />
              </div>
            </div>
          )}

          <Button
            onClick={handleGeneratePdf}
            disabled={isGeneratingPdf || totalCount === 0}
            fullWidth
          >
            {isGeneratingPdf ? 'Generating...' : 'Generate PDF'}
          </Button>
        </div>
      </div>
    </div>
  )
}
