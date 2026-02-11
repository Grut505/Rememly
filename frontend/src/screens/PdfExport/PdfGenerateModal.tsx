import { useEffect, useState } from 'react'
import { Button } from '../../ui/Button'
import { articlesApi } from '../../api/articles'
import { Article } from '../../api/types'
import { getMonthYear } from '../../utils/date'
import { usePdfGenerationStore } from '../../stores/pdfGenerationStore'
import type { PdfListItem } from '../../api/pdf'
import { pdfApi } from '../../api/pdf'

interface PdfGenerateModalProps {
  isOpen: boolean
  onClose: () => void
  onComplete: (job: PdfListItem | null) => void
}

interface MonthCount {
  key: string
  label: string
  activeCount: number
  draftCount: number
  duplicateCount: number
}

type Step = 'dates' | 'preview' | 'options'

const parseDateParts = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return { y: '', m: '', d: '' }
  return { y: match[1], m: match[2], d: match[3] }
}

const buildDateString = (y: string, m: string, d: string) => {
  if (!y || !m || !d) return ''
  return `${y}-${m}-${d}`
}

const getDaysInMonth = (year: string, month: string) => {
  const y = Number(year)
  const m = Number(month)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return 31
  return new Date(y, m, 0).getDate()
}

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
  const [coverStyle, setCoverStyle] = useState<'mosaic' | 'masked-title'>('mosaic')
  const [autoMerge, setAutoMerge] = useState(false)
  const [cleanChunksAfterMerge, setCleanChunksAfterMerge] = useState(false)
  const [activePicker, setActivePicker] = useState<'start' | 'end'>('start')
  const [tempDate, setTempDate] = useState({ y: '', m: '', d: '' })
  const [isPwa, setIsPwa] = useState(false)

  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 26 }, (_, i) => String(currentYear - 10 + i))

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
    setCoverStyle('mosaic')
    setAutoMerge(false)
    setCleanChunksAfterMerge(false)
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
          status_filter: 'all',
        })
        allArticles.push(...response.items)
        cursor = response.next_cursor
      } while (cursor)

      // Group by month
      const monthMap = new Map<string, { label: string; activeCount: number; draftCount: number; duplicateCount: number }>()
      let activeTotal = 0
      let nonDeletedTotal = 0

      for (const article of allArticles) {
        if (article.status === 'DELETED') continue
        nonDeletedTotal++
        const key = article.date.substring(0, 7) // YYYY-MM
        const label = getMonthYear(article.date)
        const isActive = article.status === 'ACTIVE'
        const isDraft = article.status === 'DRAFT'
        const isDuplicate = article.is_duplicate === true

        if (!monthMap.has(key)) {
          monthMap.set(key, { label, activeCount: 0, draftCount: 0, duplicateCount: 0 })
        }

        const bucket = monthMap.get(key)!
        if (isActive) {
          bucket.activeCount++
          activeTotal++
        }
        if (isDraft) {
          bucket.draftCount++
        }
        if (isDuplicate) {
          bucket.duplicateCount++
        }
      }

      // Sort by key (chronological order)
      const sorted = Array.from(monthMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, value]) => ({
          key,
          label: value.label,
          activeCount: value.activeCount,
          draftCount: value.draftCount,
          duplicateCount: value.duplicateCount,
        }))

      setMonthCounts(sorted)
      setTotalArticles(activeTotal)
      setMaxMosaicPhotos(activeTotal) // Default to all active photos

      if (nonDeletedTotal === 0) {
        setError('No articles found for this period')
        return
      }
      if (activeTotal === 0) {
        setError('No active articles found for this period')
      }
      setStep('preview')
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
      cover_style: coverStyle,
      auto_merge: autoMerge,
      clean_chunks: autoMerge ? cleanChunksAfterMerge : undefined,
    })

    // Close modal immediately - progress will show in global notification
    reset()
    onClose()
    onComplete(job)
  }


  const openDatePicker = (which: 'start' | 'end') => {
    const source = which === 'start' ? startDate : endDate
    const parts = parseDateParts(source)
    if (!parts.y || !parts.m || !parts.d) {
      const today = new Date()
      parts.y = String(today.getFullYear())
      parts.m = String(today.getMonth() + 1).padStart(2, '0')
      parts.d = String(today.getDate()).padStart(2, '0')
    }
    setTempDate(parts)
    setActivePicker(which)
  }

  // preview moved to Settings

  const applyTempDate = (next: string) => {
    if (!next) return
    if (activePicker === 'start') {
      setStartDate(next)
      if (endDate && next > endDate) setEndDate(next)
    } else {
      setEndDate(next)
      if (startDate && next < startDate) setStartDate(next)
    }
    if (error) setError(null)
  }


  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0
    const previous = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    }
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as { standalone?: boolean }).standalone === true
    setIsPwa(standalone)
    return () => {
      cancelled = true
      document.body.style.overflow = previous.overflow
      document.body.style.position = previous.position
      document.body.style.top = previous.top
      document.body.style.width = previous.width
      window.scrollTo(0, scrollY)
    }
  }, [isOpen])


  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />


      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col mx-2 pdf-generate-modal">
        <style>
          {`
            .pdf-generate-modal input[type="date"] {
              width: 100% !important;
              max-width: 100% !important;
              min-width: 0 !important;
              box-sizing: border-box !important;
              display: block;
            }
          `}
        </style>
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
        <div className="flex-1 overflow-y-auto overscroll-contain p-4">
          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Step: Dates */}
          {step === 'dates' && (
            <div className="space-y-4">
              <div className="min-w-0">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start date
                </label>
                {isPwa ? (
                  <button
                    type="button"
                    onClick={() => openDatePicker('start')}
                    disabled={loading}
                    className={`w-full px-3 py-2 border rounded-lg text-left text-sm bg-white ${
                      activePicker === 'start' ? 'border-primary-500 ring-1 ring-primary-200' : 'border-gray-300'
                    }`}
                  >
                    {startDate || 'Select date'}
                  </button>
                ) : (
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      const next = e.target.value
                      setStartDate(next)
                      if (endDate && next && endDate < next) setEndDate(next)
                      if (error) setError(null)
                    }}
                    disabled={loading}
                    max={endDate || undefined}
                    className="block w-full min-w-0 max-w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100"
                    style={{ maxWidth: '100%', width: '100%' }}
                  />
                )}
              </div>
              <div className="min-w-0">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End date
                </label>
                {isPwa ? (
                  <button
                    type="button"
                    onClick={() => openDatePicker('end')}
                    disabled={loading}
                    className={`w-full px-3 py-2 border rounded-lg text-left text-sm bg-white ${
                      activePicker === 'end' ? 'border-primary-500 ring-1 ring-primary-200' : 'border-gray-300'
                    }`}
                  >
                    {endDate || 'Select date'}
                  </button>
                ) : (
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      const next = e.target.value
                      setEndDate(next)
                      if (startDate && next && next < startDate) setStartDate(next)
                      if (error) setError(null)
                    }}
                    disabled={loading}
                    min={startDate || undefined}
                    className="block w-full min-w-0 max-w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100"
                    style={{ maxWidth: '100%', width: '100%' }}
                  />
                )}
              </div>
              {isPwa && (
                <div className="mt-2 border border-gray-200 rounded-lg bg-gray-50 p-3">
                  <div className="text-xs text-gray-500 mb-2">Select date (wheel)</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(() => {
                      const days = getDaysInMonth(tempDate.y, tempDate.m)
                      const lists = [
                        { key: 'y', values: yearOptions },
                        { key: 'm', values: Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')) },
                        { key: 'd', values: Array.from({ length: days }, (_, i) => String(i + 1).padStart(2, '0')) },
                      ] as const
                      const itemHeight = 32
                      return lists.map((list) => (
                        <div
                          key={list.key}
                          className="h-40 overflow-y-auto snap-y snap-mandatory bg-white border border-gray-200 rounded-lg"
                          onScroll={(e) => {
                            const el = e.currentTarget
                            const index = Math.round(el.scrollTop / itemHeight)
                            const value = list.values[Math.max(0, Math.min(list.values.length - 1, index))] || ''
                            setTempDate((prev) => {
                              const next = { ...prev, [list.key]: value }
                              if (list.key === 'm') {
                                const maxDays = getDaysInMonth(next.y, value)
                                if (next.d && Number(next.d) > maxDays) {
                                  next.d = String(maxDays).padStart(2, '0')
                                }
                              }
                              const nextStr = buildDateString(next.y, next.m, next.d)
                              applyTempDate(nextStr)
                              return next
                            })
                          }}
                        >
                          <div style={{ height: itemHeight }} />
                          {list.values.map((val) => {
                            const selected = tempDate[list.key as 'y' | 'm' | 'd'] === val
                            return (
                              <div
                                key={val}
                                className={`h-8 flex items-center justify-center snap-center text-sm ${
                                  selected ? 'text-primary-700 font-semibold' : 'text-gray-600'
                                }`}
                              >
                                {val}
                              </div>
                            )
                          })}
                          <div style={{ height: itemHeight }} />
                        </div>
                      ))
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step: Preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="bg-primary-50 rounded-lg p-4">
                <p className="text-primary-800">
                  <span className="font-semibold text-primary-900">{totalArticles}</span> active article{totalArticles > 1 ? 's' : ''}
                  {' '}across{' '}
                  <span className="font-semibold text-primary-900">{monthCounts.length}</span> mois
                </p>
              </div>

              {/* Month breakdown */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700">Monthly breakdown</h4>
                </div>
                <ul className="divide-y divide-gray-100 max-h-[40vh] overflow-y-auto overscroll-contain">
                  {monthCounts.map((month) => (
                    <li key={month.key} className="px-3 py-2 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm text-gray-700">{month.label}</div>
                        <div className="text-xs text-gray-500">
                          Draft {month.draftCount} · Duplicate {month.duplicateCount}
                        </div>
                      </div>
                      <span className="bg-primary-100 text-primary-700 px-2.5 py-0.5 rounded text-xs font-medium whitespace-nowrap">
                        Active {month.activeCount}
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
              {/* Summary reminder */}
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                <strong>{totalArticles}</strong> articles from{' '}
                <strong>{new Date(startDate).toLocaleDateString('fr-FR')}</strong> to{' '}
                <strong>{new Date(endDate).toLocaleDateString('fr-FR')}</strong>
              </div>

              <div className="border border-gray-200 rounded-lg bg-gray-50/60 p-4 space-y-4">
                <div className="text-sm font-medium text-gray-700">Cover</div>

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

                {/* Cover style */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cover style
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCoverStyle('mosaic')}
                      className={`flex-1 py-2.5 px-3 rounded-lg border text-sm transition-colors ${
                        coverStyle === 'mosaic'
                          ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Mosaic
                    </button>
                    <button
                      onClick={() => setCoverStyle('masked-title')}
                      className={`flex-1 py-2.5 px-3 rounded-lg border text-sm transition-colors ${
                        coverStyle === 'masked-title'
                          ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Masked title
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-xs text-gray-600">
                    Cover text (family name, title, subtitle) uses the values configured in Settings.
                  </p>
                </div>

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

              {/* Auto merge toggle */}
              <label className="flex items-center gap-3 cursor-pointer p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <input
                  type="checkbox"
                  checked={autoMerge}
                  onChange={(e) => setAutoMerge(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">Auto-merge via GitHub Action</span>
                  <p className="text-xs text-gray-500">Triggers the merge workflow after chunks are generated</p>
                </div>
              </label>

              {autoMerge && (
                <label className="flex items-center gap-3 cursor-pointer p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={cleanChunksAfterMerge}
                    onChange={(e) => setCleanChunksAfterMerge(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700">Delete chunks after merge</span>
                    <p className="text-xs text-gray-500">Remove intermediate PDF parts once the merge succeeds</p>
                  </div>
                </label>
              )}

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
              <Button onClick={() => setStep('options')} disabled={totalArticles === 0} fullWidth>
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
