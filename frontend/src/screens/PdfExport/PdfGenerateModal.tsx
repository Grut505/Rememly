import { useEffect, useState } from 'react'
import { Button } from '../../ui/Button'
import { DatePicker } from '../../ui/DatePicker'
import { Slider } from '../../ui/Slider'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { articlesApi } from '../../api/articles'
import { Article } from '../../api/types'
import { getMonthYear } from '../../utils/date'
import { usePdfGenerationStore } from '../../stores/pdfGenerationStore'
import type { PdfListItem } from '../../api/pdf'
import { pdfApi } from '../../api/pdf'
import { configApi } from '../../api/config'
import {
  BlurbFormat, BlurbCoverType, BlurbPaperType,
  BLURB_FORMAT_LABELS, BLURB_PAPER_TYPES, PAGE_COUNT_MIN, PAGE_COUNT_MAX,
  estimateInteriorPageCount, spineWidthIn, formatSpineWidth,
} from '../../utils/blurbPrintSpec'

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
  const [coverStyle, setCoverStyle] = useState<'mosaic' | 'masked-title'>('masked-title')
  const [autoMerge, setAutoMerge] = useState(true)
  const [cleanChunksAfterMerge, setCleanChunksAfterMerge] = useState(true)

  // Blurb print-ready cover options (only shown/used when Blurb mode is on in Settings)
  const [blurbModeEnabled, setBlurbModeEnabled] = useState(false)
  const [blurbUnits, setBlurbUnits] = useState<'inches' | 'centimeters'>('inches')
  const [blurbFormat, setBlurbFormat] = useState<BlurbFormat>('magazine_premium')
  const [blurbCoverType, setBlurbCoverType] = useState<BlurbCoverType>('softcover')
  const [blurbPaperType, setBlurbPaperType] = useState<BlurbPaperType>(BLURB_PAPER_TYPES[0])
  const [blurbFrontBgColor, setBlurbFrontBgColor] = useState('#ffffff')
  const [blurbBackBgColor, setBlurbBackBgColor] = useState('#ffffff')
  const [blurbSpineBgColor, setBlurbSpineBgColor] = useState('#ffffff')
  const [blurbBackCoverStyle, setBlurbBackCoverStyle] = useState<'color' | 'mosaic'>('color')
  const [blurbSpineText, setBlurbSpineText] = useState('')
  const [blurbSpineFontSizeCm, setBlurbSpineFontSizeCm] = useState(0.5)
  const [showSpineWarning, setShowSpineWarning] = useState(false)

  useEffect(() => {
    Promise.all([
      configApi.get('blurb_mode_enabled'),
      configApi.get('blurb_measurement_units'),
    ]).then(([modeResult, unitsResult]) => {
      setBlurbModeEnabled(modeResult.value === 'true')
      setBlurbUnits(unitsResult.value === 'centimeters' ? 'centimeters' : 'inches')
    }).catch(() => {
      // keep defaults (Blurb mode off)
    })
  }, [])

  const estimatedPageCount = estimateInteriorPageCount(monthCounts.map((m) => m.activeCount))
  const pageCountInRange = estimatedPageCount >= PAGE_COUNT_MIN && estimatedPageCount <= PAGE_COUNT_MAX
  const estimatedSpineWidthIn = pageCountInRange
    ? spineWidthIn(estimatedPageCount, blurbCoverType, blurbPaperType)
    : null
  // A single line of spine text needs roughly its own font size in width to
  // read at all once rotated onto the spine - matches the render script's
  // same-threshold check.
  const spineTextFits = Boolean(blurbSpineText.trim())
    && estimatedSpineWidthIn !== null
    && estimatedSpineWidthIn * 2.54 >= Math.max(blurbSpineFontSizeCm, 0.3)

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
    setCoverStyle('masked-title')
    setAutoMerge(true)
    setCleanChunksAfterMerge(true)
    setBlurbFormat('magazine_premium')
    setBlurbCoverType('softcover')
    setBlurbPaperType(BLURB_PAPER_TYPES[0])
    setBlurbFrontBgColor('#ffffff')
    setBlurbBackBgColor('#ffffff')
    setBlurbSpineBgColor('#ffffff')
    setBlurbBackCoverStyle('color')
    setBlurbSpineText('')
    setBlurbSpineFontSizeCm(0.5)
    setShowSpineWarning(false)
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

  const handleGenerateClick = () => {
    // If Blurb mode is on and the spine text won't fit, warn before
    // generating rather than silently dropping it in the render.
    if (blurbModeEnabled && blurbSpineText.trim() && !spineTextFits) {
      setShowSpineWarning(true)
      return
    }
    handleGenerate()
  }

  const handleGenerate = async () => {
    setShowSpineWarning(false)
    // Start generation in background using the global store
    const job = await startGeneration(startDate, endDate, {
      mosaic_layout: mosaicLayout,
      show_seasonal_fruits: showSeasonalFruits,
      max_mosaic_photos: maxMosaicPhotos > 0 ? maxMosaicPhotos : undefined,
      cover_style: coverStyle,
      auto_merge: autoMerge,
      clean_chunks: autoMerge ? cleanChunksAfterMerge : undefined,
      ...(blurbModeEnabled ? {
        blurb_mode_enabled: true,
        blurb_format: blurbFormat,
        blurb_cover_type: blurbCoverType,
        blurb_paper_type: blurbPaperType,
        blurb_front_bg_color: blurbFrontBgColor,
        blurb_back_bg_color: blurbBackBgColor,
        blurb_spine_bg_color: blurbSpineBgColor,
        blurb_back_cover_style: blurbBackCoverStyle,
        blurb_spine_text: blurbSpineText.trim() || undefined,
        blurb_spine_font_size_cm: blurbSpineFontSizeCm,
      } : {}),
    })

    // Close modal immediately - progress will show in global notification
    reset()
    onClose()
    onComplete(job)
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
              <DatePicker
                label="Start date"
                value={startDate}
                onChange={(next) => {
                  setStartDate(next)
                  if (endDate && next && endDate < next) setEndDate(next)
                  if (error) setError(null)
                }}
                max={endDate || undefined}
              />
              <DatePicker
                label="End date"
                value={endDate}
                onChange={(next) => {
                  setEndDate(next)
                  if (startDate && next && next < startDate) setStartDate(next)
                  if (error) setError(null)
                }}
                min={startDate || undefined}
              />
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
                  <Slider
                    min={1}
                    max={Math.max(1, totalArticles)}
                    value={maxMosaicPhotos || totalArticles}
                    onChange={(next) => setMaxMosaicPhotos(next)}
                  />
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
                      onClick={() => setCoverStyle('masked-title')}
                      className={`flex-1 py-2.5 px-3 rounded-lg border text-sm transition-colors ${
                        coverStyle === 'masked-title'
                          ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Masked title
                    </button>
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
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-xs text-gray-600">
                    Cover text (family name, title, subtitle) uses the values configured in Settings.
                  </p>
                </div>

              </div>

              {/* Blurb print-ready cover options - only shown when Blurb mode is enabled in Settings */}
              {blurbModeEnabled && (
                <div className="border border-purple-200 rounded-lg bg-purple-50/40 p-4 space-y-4">
                  <div className="text-sm font-medium text-purple-900">Print-ready cover for Blurb</div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Book format</label>
                    <div className="flex gap-2">
                      {(Object.keys(BLURB_FORMAT_LABELS) as BlurbFormat[]).map((fmt) => (
                        <button
                          key={fmt}
                          onClick={() => setBlurbFormat(fmt)}
                          className={`flex-1 py-2.5 px-3 rounded-lg border text-sm transition-colors ${
                            blurbFormat === fmt
                              ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                              : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {BLURB_FORMAT_LABELS[fmt]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Cover type</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setBlurbCoverType('softcover')}
                        className={`flex-1 py-2.5 px-3 rounded-lg border text-sm transition-colors ${
                          blurbCoverType === 'softcover'
                            ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                            : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        Softcover
                      </button>
                      <button
                        onClick={() => setBlurbCoverType('hardcover')}
                        className={`flex-1 py-2.5 px-3 rounded-lg border text-sm transition-colors ${
                          blurbCoverType === 'hardcover'
                            ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                            : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        Hardcover (ImageWrap)
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Paper type</label>
                    <select
                      value={blurbPaperType}
                      onChange={(e) => setBlurbPaperType(e.target.value as BlurbPaperType)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      {BLURB_PAPER_TYPES.map((paper) => (
                        <option key={paper} value={paper}>{paper}</option>
                      ))}
                    </select>
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-1">
                    <p className="text-xs text-gray-600">
                      Estimated interior page count: <strong>{estimatedPageCount}</strong>
                      {!pageCountInRange && (
                        <span className="text-red-600"> (outside Blurb's {PAGE_COUNT_MIN}-{PAGE_COUNT_MAX} range - the cover won't be generated)</span>
                      )}
                    </p>
                    {estimatedSpineWidthIn !== null && (
                      <p className="text-xs text-gray-600">
                        Estimated spine width: <strong>{formatSpineWidth(estimatedSpineWidthIn, blurbUnits)}</strong>
                      </p>
                    )}
                    <p className="text-[11px] text-gray-400">
                      Estimates only - the real page count and spine width are computed from the actual generated interior.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Background colors</label>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Front</label>
                        <input type="color" value={blurbFrontBgColor} onChange={(e) => setBlurbFrontBgColor(e.target.value)} className="w-full h-9 rounded border border-gray-300" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Back</label>
                        <input type="color" value={blurbBackBgColor} onChange={(e) => setBlurbBackBgColor(e.target.value)} className="w-full h-9 rounded border border-gray-300" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Spine</label>
                        <input type="color" value={blurbSpineBgColor} onChange={(e) => setBlurbSpineBgColor(e.target.value)} className="w-full h-9 rounded border border-gray-300" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Back cover style</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setBlurbBackCoverStyle('color')}
                        className={`flex-1 py-2.5 px-3 rounded-lg border text-sm transition-colors ${
                          blurbBackCoverStyle === 'color'
                            ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                            : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        Solid color
                      </button>
                      <button
                        onClick={() => setBlurbBackCoverStyle('mosaic')}
                        className={`flex-1 py-2.5 px-3 rounded-lg border text-sm transition-colors ${
                          blurbBackCoverStyle === 'mosaic'
                            ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                            : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        Full-album mosaic
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Spine text (optional)</label>
                    <input
                      type="text"
                      value={blurbSpineText}
                      onChange={(e) => setBlurbSpineText(e.target.value)}
                      placeholder="e.g. family name"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <div className="mt-2">
                      <Slider
                        label="Font size"
                        min={0.2}
                        max={1.5}
                        step={0.05}
                        value={blurbSpineFontSizeCm}
                        onChange={setBlurbSpineFontSizeCm}
                        formatValue={(v) => `${v.toFixed(2)}cm`}
                      />
                    </div>
                    {blurbSpineText.trim() && !spineTextFits && (
                      <p className="text-xs text-amber-600 mt-1">
                        The spine may be too narrow for this text at the current font size - you'll be asked to confirm before generating.
                      </p>
                    )}
                  </div>
                </div>
              )}

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
                  <span className="text-sm font-medium text-gray-700">Merge the chunks automatically</span>
                  <p className="text-xs text-gray-500">Uncheck to generate only the chunks</p>
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
              <Button onClick={handleGenerateClick} disabled={isGenerating} fullWidth>
                <svg className="w-5 h-5 mr-2" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                  <path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                </svg>
                Generate PDF
              </Button>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={showSpineWarning}
        title="Spine text may not fit"
        message="The spine is estimated to be too narrow for your spine text at the current font size. If you continue, the cover-wrap PDF will render the spine as color-only, without the text."
        confirmLabel="Generate anyway"
        cancelLabel="Go back"
        variant="danger"
        onConfirm={handleGenerate}
        onCancel={() => setShowSpineWarning(false)}
      />

    </div>
  )
}
