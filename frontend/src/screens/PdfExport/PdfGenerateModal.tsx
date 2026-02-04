import { useEffect, useState } from 'react'
import { Button } from '../../ui/Button'
import { articlesApi } from '../../api/articles'
import { Article } from '../../api/types'
import { getMonthYear } from '../../utils/date'
import { usePdfGenerationStore } from '../../stores/pdfGenerationStore'
import type { PdfListItem } from '../../api/pdf'
import { pdfApi } from '../../api/pdf'
import { configApi } from '../../api/config'

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
  const [familyName, setFamilyName] = useState('')
  const [coverTitle, setCoverTitle] = useState('')
  const [coverSubtitle, setCoverSubtitle] = useState('')
  const [configLoading, setConfigLoading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFileId, setPreviewFileId] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

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
    setFamilyName('')
    setCoverTitle('')
    setCoverSubtitle('')
  }

  const handleClose = () => {
    if (previewUrl || previewFileId) {
      void handleClosePreview()
    }
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
      family_name: familyName.trim() || undefined,
      cover_title: coverTitle.trim() || undefined,
      cover_subtitle: coverSubtitle.trim() || undefined,
      auto_merge: autoMerge,
      clean_chunks: autoMerge ? cleanChunksAfterMerge : undefined,
    })

    // Close modal immediately - progress will show in global notification
    reset()
    onClose()
    onComplete(job)
  }

  const handleOpenPreview = async () => {
    if (!startDate || !endDate) {
      setError('Please select a start and end date')
      return
    }
    setPreviewLoading(true)
    setError(null)
    try {
      const response = await pdfApi.previewCover({
        from: startDate,
        to: endDate,
        options: {
          max_mosaic_photos: maxMosaicPhotos > 0 ? maxMosaicPhotos : undefined,
          cover_style: coverStyle,
          family_name: familyName.trim() || undefined,
          cover_title: coverTitle.trim() || undefined,
          cover_subtitle: coverSubtitle.trim() || undefined,
        },
      })
      setPreviewFileId(response.file_id)
      const content = await pdfApi.previewCoverContent(response.file_id)
      const byteCharacters = atob(content.base64)
      const byteArrays: Uint8Array[] = []
      const sliceSize = 1024
      for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
        const slice = byteCharacters.slice(offset, offset + sliceSize)
        const byteNumbers = new Array(slice.length)
        for (let i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i)
        }
        byteArrays.push(new Uint8Array(byteNumbers))
      }
      const blob = new Blob(byteArrays, { type: content.mime_type || 'application/pdf' })
      const url = URL.createObjectURL(blob)
      setPreviewUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate cover preview')
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleClosePreview = async () => {
    const fileId = previewFileId
    const url = previewUrl
    setPreviewUrl(null)
    setPreviewFileId(null)
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url)
    }
    if (fileId) {
      try {
        await pdfApi.deleteCoverPreview(fileId)
      } catch {
        // Ignore cleanup errors
      }
    }
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
    const loadConfig = async () => {
      setConfigLoading(true)
      try {
        const [familyResult, titleResult, subtitleResult] = await Promise.all([
          configApi.get('family_name'),
          configApi.get('pdf_cover_title'),
          configApi.get('pdf_cover_subtitle'),
        ])
        if (cancelled) return
        setFamilyName(familyResult.value || '')
        setCoverTitle(titleResult.value || '')
        setCoverSubtitle(subtitleResult.value || '')
      } catch {
        if (!cancelled) {
          setFamilyName('')
          setCoverTitle('')
          setCoverSubtitle('')
        }
      } finally {
        if (!cancelled) {
          setConfigLoading(false)
        }
      }
    }
    loadConfig()
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

      {previewUrl && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={handleClosePreview} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-4xl h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Cover preview</h3>
              <button
                onClick={handleClosePreview}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                  <path d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
            <div className="flex-1 bg-gray-50">
              <iframe
                title="Cover preview"
                src={previewUrl}
                className="w-full h-full"
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col mx-2">
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
                  className="block w-full min-w-0 max-w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100"
                />
              </div>
              <div className="min-w-0">
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
                  className="block w-full min-w-0 max-w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100"
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

                {/* Cover text overrides */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-700">
                      Cover text
                    </label>
                    {configLoading && (
                      <span className="text-xs text-gray-400">Loading defaults...</span>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Family name (vertical)
                    </label>
                    <input
                      type="text"
                      value={familyName}
                      onChange={(e) => setFamilyName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="Famille Dupont"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Title
                    </label>
                    <input
                      type="text"
                      value={coverTitle}
                      onChange={(e) => setCoverTitle(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="Memory Book"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Subtitle
                    </label>
                    <input
                      type="text"
                      value={coverSubtitle}
                      onChange={(e) => setCoverSubtitle(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="Du 01/01/2024 au 31/12/2024"
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    Defaults are pulled from Settings and can be overridden per PDF.
                  </p>
                </div>

                <div>
                  {!previewUrl ? (
                    <Button
                      variant="secondary"
                      onClick={handleOpenPreview}
                      disabled={previewLoading || totalArticles === 0}
                      fullWidth
                    >
                      {previewLoading ? (
                        <span className="inline-flex items-center gap-2">
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Generating cover preview...
                        </span>
                      ) : (
                        'Preview cover'
                      )}
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-primary-200 bg-primary-50 text-primary-700 text-sm font-medium hover:bg-primary-100 transition-colors"
                      >
                        Open cover PDF
                        <svg className="w-4 h-4" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                          <path d="M14 3h7v7m0-7L10 14m-4 7h7a2 2 0 002-2v-7"></path>
                        </svg>
                      </a>
                      <button
                        onClick={handleClosePreview}
                        className="w-full text-xs text-gray-500 hover:text-gray-700"
                      >
                        Close preview
                      </button>
                    </div>
                  )}
                  {totalArticles === 0 && (
                    <p className="text-xs text-amber-600 mt-2">
                      No active articles in this range.
                    </p>
                  )}
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
