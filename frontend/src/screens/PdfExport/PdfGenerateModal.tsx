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
import { useProjectsStore } from '../../state/projectsStore'
import {
  BlurbFormat, BlurbCoverType, BlurbPaperType,
  BLURB_FORMAT_LABELS, BLURB_PAPER_TYPES, BLURB_PAPER_LABELS, COVER_FONT_OPTIONS,
  PAGE_COUNT_MIN, PAGE_COUNT_MAX,
  SPINE_FONT_SIZE_MIN_CM, SPINE_FONT_SIZE_MAX_CM,
  estimateInteriorPageCount, spineWidthIn, formatSpineWidth, recommendedSpineFontSizeCm, cmToIn, inToCm, spineTextFitsHeight,
} from '../../utils/blurbPrintSpec'

type GenerationMode = 'normal' | 'blurb' | 'both'

interface BlurbSettings {
  format: BlurbFormat
  coverType: BlurbCoverType
  paperType: BlurbPaperType
  frontBgColor: string
  backBgColor: string
  spineBgColor: string
  backCoverStyle: 'color' | 'mosaic'
  mirrorOddPages: boolean
  spineText: string
  spineTextColor: string
  spineFontFamily: string
  spineFontSizeCm: number
}

const DEFAULT_BLURB_SETTINGS: BlurbSettings = {
  format: 'magazine_premium',
  coverType: 'softcover',
  paperType: 'standard',
  frontBgColor: '#ffffff',
  backBgColor: '#ffffff',
  spineBgColor: '#ffffff',
  backCoverStyle: 'color',
  mirrorOddPages: false,
  spineText: '',
  spineTextColor: '#000000',
  spineFontFamily: 'palatino',
  spineFontSizeCm: 0.5,
}

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

  // Date selection - defaults to the current year (Jan 1 - Dec 31), still
  // freely editable by the user.
  const currentYear = new Date().getFullYear()
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`)
  const [endDate, setEndDate] = useState(`${currentYear}-12-31`)
  const { projects, load: loadProjects } = useProjectsStore()
  const [projectId, setProjectId] = useState('')

  useEffect(() => {
    loadProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Blurb: master toggle + parameters, all configured in Settings now - this
  // modal only reads them to pick a generation mode and run the pre-generation
  // spine-fit check.
  const [blurbModeEnabled, setBlurbModeEnabled] = useState(false)
  const [blurbUnits, setBlurbUnits] = useState<'inches' | 'centimeters'>('inches')
  const [blurbSettings, setBlurbSettings] = useState<BlurbSettings>(DEFAULT_BLURB_SETTINGS)
  // Spine font size is the one Blurb parameter kept editable here too (not
  // just in Settings): unlike the others, whether it fits depends on the
  // page count, which is only really known once the real content is
  // estimated below - Settings only has a simulated page count. Defaults to
  // the Settings value but can be overridden locally for this export only.
  const [spineFontSizeCm, setSpineFontSizeCm] = useState(DEFAULT_BLURB_SETTINGS.spineFontSizeCm)
  const [generationMode, setGenerationMode] = useState<GenerationMode>('normal')
  const [showSpineWarning, setShowSpineWarning] = useState(false)
  const [showBlurbOverrides, setShowBlurbOverrides] = useState(false)

  useEffect(() => {
    Promise.all([
      configApi.get('blurb_mode_enabled'),
      configApi.get('blurb_measurement_units'),
      configApi.get('blurb_format'),
      configApi.get('blurb_cover_type'),
      configApi.get('blurb_paper_type'),
      configApi.get('blurb_front_bg_color'),
      configApi.get('blurb_back_bg_color'),
      configApi.get('blurb_spine_bg_color'),
      configApi.get('blurb_back_cover_style'),
      configApi.get('blurb_mirror_odd_pages'),
      configApi.get('blurb_spine_text'),
      configApi.get('blurb_spine_text_color'),
      configApi.get('blurb_spine_font_family'),
      configApi.get('blurb_spine_font_size_cm'),
    ]).then(([mode, units, format, coverType, paperType, frontBg, backBg, spineBg, backStyle, mirrorOddPages, spineText, spineTextColor, spineFontFamily, spineFontCm]) => {
      setBlurbModeEnabled(mode.value === 'true')
      setBlurbUnits(units.value === 'centimeters' ? 'centimeters' : 'inches')
      setBlurbSettings({
        format: (format.value === 'standard_portrait' ? 'standard_portrait' : 'magazine_premium'),
        coverType: (coverType.value === 'hardcover' ? 'hardcover' : 'softcover'),
        paperType: (paperType.value as BlurbPaperType) || DEFAULT_BLURB_SETTINGS.paperType,
        frontBgColor: frontBg.value || DEFAULT_BLURB_SETTINGS.frontBgColor,
        backBgColor: backBg.value || DEFAULT_BLURB_SETTINGS.backBgColor,
        spineBgColor: spineBg.value || DEFAULT_BLURB_SETTINGS.spineBgColor,
        backCoverStyle: (backStyle.value === 'mosaic' ? 'mosaic' : 'color'),
        mirrorOddPages: mirrorOddPages.value === 'true',
        spineText: spineText.value || '',
        spineTextColor: spineTextColor.value || DEFAULT_BLURB_SETTINGS.spineTextColor,
        spineFontFamily: spineFontFamily.value || DEFAULT_BLURB_SETTINGS.spineFontFamily,
        spineFontSizeCm: spineFontCm.value ? Number(spineFontCm.value) : DEFAULT_BLURB_SETTINGS.spineFontSizeCm,
      })
      setSpineFontSizeCm(spineFontCm.value ? Number(spineFontCm.value) : DEFAULT_BLURB_SETTINGS.spineFontSizeCm)
    }).catch(() => {
      // keep defaults (Blurb mode off)
    })
  }, [])

  // Blurb only offers Magazine Premium as Softcover - if the user overrides
  // format to Magazine Premium while Hardcover is selected, fall back to
  // Softcover rather than sending an invalid combination.
  useEffect(() => {
    if (blurbSettings.format === 'magazine_premium' && blurbSettings.coverType === 'hardcover') {
      setBlurbSettings((prev) => ({ ...prev, coverType: 'softcover' }))
    }
  }, [blurbSettings.format, blurbSettings.coverType])

  const estimatedPageCount = estimateInteriorPageCount(monthCounts.map((m) => m.activeCount))
  const pageCountInRange = estimatedPageCount >= PAGE_COUNT_MIN && estimatedPageCount <= PAGE_COUNT_MAX
  const estimatedSpineWidthIn = pageCountInRange
    ? spineWidthIn(estimatedPageCount, blurbSettings.coverType, blurbSettings.paperType)
    : null
  // A single line of spine text needs roughly its own font size in width to
  // read at all once rotated onto the spine - matches the render script's
  // same-threshold check.
  const spineTextFitsWidth = Boolean(blurbSettings.spineText.trim())
    && estimatedSpineWidthIn !== null
    && estimatedSpineWidthIn * 2.54 >= spineFontSizeCm
  // Separately, the text's estimated rendered LENGTH must fit within the
  // spine's available length (the panel's trim height) or it gets clipped
  // by the spine panel's overflow:hidden.
  const spineTextFitsHeightCheck = spineTextFitsHeight(blurbSettings.spineText, spineFontSizeCm, blurbSettings.format, blurbSettings.coverType)
  const spineTextFits = spineTextFitsWidth && spineTextFitsHeightCheck
  const recommendedFontSizeCm = estimatedSpineWidthIn !== null
    ? recommendedSpineFontSizeCm(estimatedSpineWidthIn)
    : null
  const includesBlurb = generationMode === 'blurb' || generationMode === 'both'

  const reset = () => {
    setStep('dates')
    setStartDate(`${currentYear}-01-01`)
    setEndDate(`${currentYear}-12-31`)
    setMonthCounts([])
    setTotalArticles(0)
    setError(null)
    setMosaicLayout('full')
    setShowSeasonalFruits(true)
    setMaxMosaicPhotos(0)
    setCoverStyle('masked-title')
    setAutoMerge(true)
    setCleanChunksAfterMerge(true)
    setGenerationMode('normal')
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
          project: projectId || undefined,
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
    // If the chosen mode includes Blurb and the spine text won't fit, warn
    // before generating rather than silently dropping it in the render.
    if (includesBlurb && blurbSettings.spineText.trim() && !spineTextFits) {
      setShowSpineWarning(true)
      return
    }
    handleGenerate()
  }

  const handleGenerate = async () => {
    setShowSpineWarning(false)

    const selectedProject = projects.find((p) => p.id === projectId)

    const commonOptions = {
      mosaic_layout: mosaicLayout,
      show_seasonal_fruits: showSeasonalFruits,
      max_mosaic_photos: maxMosaicPhotos > 0 ? maxMosaicPhotos : undefined,
      cover_style: coverStyle,
      auto_merge: autoMerge,
      clean_chunks: autoMerge ? cleanChunksAfterMerge : undefined,
      project_id: selectedProject?.id,
      project_name: selectedProject?.name,
    }

    const jobs: (PdfListItem | null)[] = []

    // "Both" creates two independent jobs from this single request - the
    // interior page dimensions differ between modes (A4-ish vs the chosen
    // Blurb trim size), so one render job cannot produce both.
    if (generationMode === 'normal' || generationMode === 'both') {
      jobs.push(await startGeneration(startDate, endDate, commonOptions))
    }
    if (generationMode === 'blurb' || generationMode === 'both') {
      jobs.push(await startGeneration(startDate, endDate, {
        ...commonOptions,
        blurb_mode_enabled: true,
        blurb_format: blurbSettings.format,
        blurb_cover_type: blurbSettings.coverType,
        blurb_paper_type: blurbSettings.paperType,
        blurb_front_bg_color: blurbSettings.frontBgColor,
        blurb_back_bg_color: blurbSettings.backBgColor,
        blurb_spine_bg_color: blurbSettings.spineBgColor,
        blurb_back_cover_style: blurbSettings.backCoverStyle,
        blurb_mirror_odd_pages: blurbSettings.mirrorOddPages,
        blurb_spine_text: blurbSettings.spineText.trim() || undefined,
        blurb_spine_text_color: blurbSettings.spineTextColor,
        blurb_spine_font_family: blurbSettings.spineFontFamily,
        blurb_spine_font_size_cm: spineFontSizeCm,
      }))
    }

    // Close modal immediately - progress will show in global notification
    reset()
    onClose()
    jobs.forEach((job) => onComplete(job))
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
              {projects.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All projects</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
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

              {/* Generation mode - only shown when Blurb mode is enabled in Settings.
                  All Blurb parameters (format, cover type, paper, colors, spine text,
                  back cover style) are configured in Settings, not here. */}
              {blurbModeEnabled && (
                <div className="border border-purple-200 rounded-lg bg-purple-50/40 p-4 space-y-3">
                  <div className="text-sm font-medium text-purple-900">Generation mode</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setGenerationMode('normal')}
                      className={`flex-1 py-2.5 px-3 rounded-lg border text-sm transition-colors ${
                        generationMode === 'normal'
                          ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Normal
                    </button>
                    <button
                      onClick={() => setGenerationMode('blurb')}
                      className={`flex-1 py-2.5 px-3 rounded-lg border text-sm transition-colors ${
                        generationMode === 'blurb'
                          ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Blurb
                    </button>
                    <button
                      onClick={() => setGenerationMode('both')}
                      className={`flex-1 py-2.5 px-3 rounded-lg border text-sm transition-colors ${
                        generationMode === 'both'
                          ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Both
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Blurb parameters (format, cover type, paper, colors, spine text) come from Settings.
                    {generationMode === 'both' && ' "Both" creates two independent jobs - a normal album and a Blurb book - from this same date range.'}
                  </p>

                  {includesBlurb && (
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <button
                        onClick={() => setShowBlurbOverrides((v) => !v)}
                        className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                      >
                        {showBlurbOverrides ? 'Hide' : 'Override'} Settings parameters for this export
                      </button>
                      {showBlurbOverrides && (
                        <div className="mt-3 space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Format</label>
                            <div className="flex gap-2">
                              {(Object.keys(BLURB_FORMAT_LABELS) as BlurbFormat[]).map((format) => (
                                <button
                                  key={format}
                                  onClick={() => setBlurbSettings((prev) => ({ ...prev, format }))}
                                  className={`flex-1 py-2 px-2 rounded-lg border text-xs transition-colors ${
                                    blurbSettings.format === format
                                      ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                                  }`}
                                >
                                  {BLURB_FORMAT_LABELS[format]}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Cover type</label>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setBlurbSettings((prev) => ({ ...prev, coverType: 'softcover' }))}
                                className={`flex-1 py-2 px-2 rounded-lg border text-xs transition-colors ${
                                  blurbSettings.coverType === 'softcover'
                                    ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                                }`}
                              >
                                Softcover
                              </button>
                              <button
                                onClick={() => setBlurbSettings((prev) => ({ ...prev, coverType: 'hardcover' }))}
                                disabled={blurbSettings.format === 'magazine_premium'}
                                title={blurbSettings.format === 'magazine_premium' ? 'Blurb does not offer Magazine Premium as Hardcover' : undefined}
                                className={`flex-1 py-2 px-2 rounded-lg border text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                  blurbSettings.coverType === 'hardcover'
                                    ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                                }`}
                              >
                                Hardcover (ImageWrap)
                              </button>
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Paper type</label>
                            <select
                              value={blurbSettings.paperType}
                              onChange={(e) => setBlurbSettings((prev) => ({ ...prev, paperType: e.target.value as BlurbPaperType }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                            >
                              {BLURB_PAPER_TYPES.map((paper) => (
                                <option key={paper} value={paper}>{BLURB_PAPER_LABELS[paper]}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Back cover style</label>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setBlurbSettings((prev) => ({ ...prev, backCoverStyle: 'color' }))}
                                className={`flex-1 py-2 px-2 rounded-lg border text-xs transition-colors ${
                                  blurbSettings.backCoverStyle === 'color'
                                    ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                                }`}
                              >
                                Solid color
                              </button>
                              <button
                                onClick={() => setBlurbSettings((prev) => ({ ...prev, backCoverStyle: 'mosaic' }))}
                                className={`flex-1 py-2 px-2 rounded-lg border text-xs transition-colors ${
                                  blurbSettings.backCoverStyle === 'mosaic'
                                    ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                                }`}
                              >
                                Full-album mosaic
                              </button>
                            </div>
                          </div>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={blurbSettings.mirrorOddPages}
                              onChange={(e) => setBlurbSettings((prev) => ({ ...prev, mirrorOddPages: e.target.checked }))}
                              className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-xs font-medium text-gray-700">Mirror portrait photos on odd pages</span>
                          </label>

                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Background colors</label>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="block text-[11px] text-gray-500 mb-1">Front</label>
                                <input type="color" value={blurbSettings.frontBgColor} onChange={(e) => setBlurbSettings((prev) => ({ ...prev, frontBgColor: e.target.value }))} className="w-full h-8 rounded border border-gray-300" />
                              </div>
                              <div>
                                <label className="block text-[11px] text-gray-500 mb-1">Back</label>
                                <input type="color" value={blurbSettings.backBgColor} onChange={(e) => setBlurbSettings((prev) => ({ ...prev, backBgColor: e.target.value }))} className="w-full h-8 rounded border border-gray-300" />
                              </div>
                              <div>
                                <label className="block text-[11px] text-gray-500 mb-1">Spine</label>
                                <input type="color" value={blurbSettings.spineBgColor} onChange={(e) => setBlurbSettings((prev) => ({ ...prev, spineBgColor: e.target.value }))} className="w-full h-8 rounded border border-gray-300" />
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-2 items-end">
                            <div className="flex-1">
                              <label className="block text-xs font-medium text-gray-700 mb-1">Spine text</label>
                              <input
                                type="text"
                                value={blurbSettings.spineText}
                                onChange={(e) => setBlurbSettings((prev) => ({ ...prev, spineText: e.target.value }))}
                                placeholder="e.g. family name"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] text-gray-500 mb-1">Color</label>
                              <input type="color" value={blurbSettings.spineTextColor} onChange={(e) => setBlurbSettings((prev) => ({ ...prev, spineTextColor: e.target.value }))} className="h-9 w-12 rounded border border-gray-300" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Spine text font</label>
                            <select
                              value={blurbSettings.spineFontFamily}
                              onChange={(e) => setBlurbSettings((prev) => ({ ...prev, spineFontFamily: e.target.value }))}
                              className="w-full px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-700 bg-white"
                            >
                              {COVER_FONT_OPTIONS.map((font) => (
                                <option key={font.value} value={font.value}>{font.label}</option>
                              ))}
                            </select>
                          </div>

                          <p className="text-[11px] text-gray-400">
                            Changes here apply to this export only - Settings itself is unchanged.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {includesBlurb && (
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
                      {blurbSettings.spineText.trim() && (
                        <div className="pt-1">
                          <Slider
                            label="Spine font size (this export)"
                            min={blurbUnits === 'inches' ? cmToIn(SPINE_FONT_SIZE_MIN_CM) : SPINE_FONT_SIZE_MIN_CM}
                            max={blurbUnits === 'inches' ? cmToIn(SPINE_FONT_SIZE_MAX_CM) : SPINE_FONT_SIZE_MAX_CM}
                            step={blurbUnits === 'inches' ? 0.02 : 0.05}
                            value={blurbUnits === 'inches' ? cmToIn(spineFontSizeCm) : spineFontSizeCm}
                            onChange={(v) => setSpineFontSizeCm(blurbUnits === 'inches' ? inToCm(v) : v)}
                            formatValue={(v) => blurbUnits === 'inches' ? `${v.toFixed(2)}in` : `${v.toFixed(2)}cm`}
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            From Settings by default, adjustable for this export only.
                            {recommendedFontSizeCm !== null && <> Recommended for this page count: <strong>{formatSpineWidth(cmToIn(recommendedFontSizeCm), blurbUnits)}</strong>.</>}
                          </p>
                        </div>
                      )}
                      {blurbSettings.spineText.trim() && !spineTextFitsWidth && (
                        <p className="text-xs text-amber-600">
                          The spine may be too narrow for the configured spine text - you'll be asked to confirm before generating.
                        </p>
                      )}
                      {blurbSettings.spineText.trim() && spineTextFitsWidth && !spineTextFitsHeightCheck && (
                        <p className="text-xs text-amber-600">
                          This text may be too long to fit along the spine's length at this font size - you'll be asked to confirm before generating.
                        </p>
                      )}
                      <p className="text-[11px] text-gray-400">
                        Estimates only - the real page count and spine width are computed from the actual generated interior.
                      </p>
                    </div>
                  )}
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
                Generate
              </Button>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={showSpineWarning}
        title="Spine text may not fit"
        message={
          spineTextFitsWidth
            ? "The spine text is estimated to be too long to fit along the spine's length at the current font size. If you continue, the cover-wrap PDF will render the spine as color-only, without the text."
            : "The spine is estimated to be too narrow for your spine text at the current font size. If you continue, the cover-wrap PDF will render the spine as color-only, without the text."
        }
        confirmLabel="Generate anyway"
        cancelLabel="Go back"
        variant="danger"
        onConfirm={handleGenerate}
        onCancel={() => setShowSpineWarning(false)}
      />

    </div>
  )
}
