import { useState } from 'react'
import { Button } from '../../ui/Button'
import { articlesApi } from '../../api/articles'
import { Article } from '../../api/types'
import { getMonthYear } from '../../utils/date'
import { usePdfGenerationStore } from '../../stores/pdfGenerationStore'
import type { PdfListItem } from '../../api/pdf'

interface PdfGenerateModalProps {
  isOpen: boolean
  onClose: () => void
  onComplete: (job: PdfListItem | null) => void
}

interface MonthCount {
  key: string
  label: string
  count: number
}

type Step = 'dates' | 'preview' | 'options'

export function PdfGenerateModal({ isOpen, onClose, onComplete }: PdfGenerateModalProps) {
  const { startGeneration, isGenerating } = usePdfGenerationStore()

  // Step state
  const [step, setStep] = useState<Step>('dates')

  // Date selection
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Preview data
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [monthCounts, setMonthCounts] = useState<MonthCount[]>([])
  const [totalArticles, setTotalArticles] = useState(0)

  // Options
  const [mosaicLayout, setMosaicLayout] = useState<'full' | 'centered'>('full')
  const [showSeasonalFruits, setShowSeasonalFruits] = useState(true)
  const [maxMosaicPhotos, setMaxMosaicPhotos] = useState<number>(0) // 0 = all photos
  const [keepTempFiles, setKeepTempFiles] = useState(false)

  const reset = () => {
    setStep('dates')
    setStartDate('')
    setEndDate('')
    setMonthCounts([])
    setTotalArticles(0)
    setError(null)
    setMosaicLayout('full')
    setShowSeasonalFruits(true)
    setMaxMosaicPhotos(0)
    setKeepTempFiles(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSearchArticles = async () => {
    if (!startDate || !endDate) {
      setError('Please select a start and end date')
      return
    }
    if (endDate < startDate) {
      setError('End date cannot be earlier than start date')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Fetch all articles in the date range
      const allArticles: Article[] = []
      let cursor: string | null = null

      do {
        const response = await articlesApi.list({
          from: startDate,
          to: endDate,
          limit: '100',
          cursor: cursor || undefined,
          status_filter: 'active',
        })
        allArticles.push(...response.items)
        cursor = response.next_cursor
      } while (cursor)

      // Group by month
      const monthMap = new Map<string, { label: string; count: number }>()

      for (const article of allArticles) {
        const key = article.date.substring(0, 7) // YYYY-MM
        const label = getMonthYear(article.date)

        if (monthMap.has(key)) {
          monthMap.get(key)!.count++
        } else {
          monthMap.set(key, { label, count: 1 })
        }
      }

      // Sort by key (chronological order)
      const sorted = Array.from(monthMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, value]) => ({
          key,
          label: value.label,
          count: value.count,
        }))

      setMonthCounts(sorted)
      setTotalArticles(allArticles.length)
      setMaxMosaicPhotos(allArticles.length) // Default to all photos

      if (allArticles.length === 0) {
        setError('No articles found for this period')
      } else {
        setStep('preview')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error while loading')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = async () => {
    // Start generation in background using the global store
    const job = await startGeneration(startDate, endDate, {
      mosaic_layout: mosaicLayout,
      show_seasonal_fruits: showSeasonalFruits,
      max_mosaic_photos: maxMosaicPhotos > 0 ? maxMosaicPhotos : undefined,
      keep_temp: keepTempFiles,
    })

    // Close modal immediately - progress will show in global notification
    reset()
    onClose()
    onComplete(job)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {step === 'dates' && 'Select date range'}
            {step === 'preview' && 'Article preview'}
            {step === 'options' && 'Generation options'}
          </h3>
          {(
            <button
              onClick={handleClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Step: Dates */}
          {step === 'dates' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    const next = e.target.value
                    setStartDate(next)
                    if (endDate && next && endDate < next) {
                      setEndDate(next)
                    }
                    if (error) setError(null)
                  }}
                  disabled={loading}
                  max={endDate || undefined}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    const next = e.target.value
                    setEndDate(next)
                    if (startDate && next && next < startDate) {
                      setStartDate(next)
                    }
                    if (error) setError(null)
                  }}
                  disabled={loading}
                  min={startDate || undefined}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100"
                />
              </div>
            </div>
          )}

          {/* Step: Preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="bg-primary-50 rounded-lg p-4">
                <p className="text-primary-800">
                  <span className="font-semibold text-primary-900">{totalArticles}</span> article{totalArticles > 1 ? 's' : ''}
                  {' '}sur{' '}
                  <span className="font-semibold text-primary-900">{monthCounts.length}</span> mois
                </p>
              </div>

              {/* Month breakdown */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700">Monthly breakdown</h4>
                </div>
                <ul className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
                  {monthCounts.map((month) => (
                    <li key={month.key} className="px-3 py-2 flex justify-between items-center">
                      <span className="text-sm text-gray-700">{month.label}</span>
                      <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-medium">
                        {month.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Step: Options */}
          {step === 'options' && (
            <div className="space-y-5">
              {/* Mosaic photo limit */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cover photos
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={totalArticles}
                    value={maxMosaicPhotos || totalArticles}
                    onChange={(e) => setMaxMosaicPhotos(parseInt(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                  />
                  <span className="text-sm font-medium text-gray-700 min-w-12 text-right">
                    {maxMosaicPhotos || totalArticles}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Number of photos in the cover mosaic
                </p>
              </div>

              {/* Month divider layout */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Month divider style
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMosaicLayout('full')}
                    className={`flex-1 py-2.5 px-3 rounded-lg border text-sm transition-colors ${
                      mosaicLayout === 'full'
                        ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Full mosaic
                  </button>
                  <button
                    onClick={() => setMosaicLayout('centered')}
                    className={`flex-1 py-2.5 px-3 rounded-lg border text-sm transition-colors ${
                      mosaicLayout === 'centered'
                        ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Centered mosaic
                  </button>
                </div>
              </div>

              {/* Seasonal fruits toggle */}
              <label className="flex items-center gap-3 cursor-pointer p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <input
                  type="checkbox"
                  checked={showSeasonalFruits}
                  onChange={(e) => setShowSeasonalFruits(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">Seasonal fruits & vegetables</span>
                  <p className="text-xs text-gray-500">Decorations around month dividers</p>
                </div>
              </label>

              {/* Keep temp files toggle */}
              <label className="flex items-center gap-3 cursor-pointer p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <input
                  type="checkbox"
                  checked={keepTempFiles}
                  onChange={(e) => setKeepTempFiles(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">Keep temporary PDF files</span>
                  <p className="text-xs text-gray-500">Preserve intermediate PDFs and show a folder link</p>
                </div>
              </label>

              {/* Summary reminder */}
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                <strong>{totalArticles}</strong> articles from{' '}
                <strong>{new Date(startDate).toLocaleDateString('fr-FR')}</strong> to{' '}
                <strong>{new Date(endDate).toLocaleDateString('fr-FR')}</strong>
              </div>
            </div>
          )}
        </div>

        {/* Footer with navigation buttons */}
        <div className="px-4 py-3 border-t border-gray-200 flex gap-3">
          {step === 'dates' && (
            <>
              <Button variant="secondary" onClick={handleClose} fullWidth>
                Cancel
              </Button>
              <Button
                onClick={handleSearchArticles}
                disabled={!startDate || !endDate || loading}
                fullWidth
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Searching...
                  </>
                ) : (
                  'Next'
                )}
              </Button>
            </>
          )}

          {step === 'preview' && (
            <>
              <Button variant="secondary" onClick={() => setStep('dates')} fullWidth>
                Back
              </Button>
              <Button onClick={() => setStep('options')} fullWidth>
                Next
              </Button>
            </>
          )}

          {step === 'options' && (
            <>
              <Button variant="secondary" onClick={() => setStep('preview')} fullWidth>
                Back
              </Button>
              <Button onClick={handleGenerate} disabled={isGenerating} fullWidth>
                <svg className="w-5 h-5 mr-2" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                  <path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                </svg>
                Generate PDF
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
