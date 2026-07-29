import { useState, useEffect } from 'react'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { Slider } from '../../ui/Slider'
import { Spinner } from '../../ui/Spinner'
import { CollapsibleSection } from '../../ui/CollapsibleSection'
import { useUiStore } from '../../state/uiStore'
import { AppHeader } from '../../ui/AppHeader'
import { configApi } from '../../api/config'
import { logsApi } from '../../api/logs'
import { usersApi, DeclaredUser } from '../../api/users'
import { articlesApi } from '../../api/articles'
import { useImageLoader } from '../../hooks/useImageLoader'
import { pdfApi } from '../../api/pdf'
import {
  BlurbFormat, BlurbCoverType, BlurbPaperType,
  BLURB_FORMAT_LABELS, BLURB_PAPER_TYPES, PAGE_COUNT_MIN, PAGE_COUNT_MAX, PAGE_COUNT_STEP,
  SPINE_FONT_SIZE_MIN_CM, SPINE_FONT_SIZE_MAX_CM,
  spineWidthIn, formatSpineWidth, recommendedSpineFontSizeCm,
} from '../../utils/blurbPrintSpec'

const fontOptions = [
  { value: 'garamond', label: 'Garamond' },
  { value: 'palatino', label: 'Palatino' },
  { value: 'baskerville', label: 'Baskerville' },
  { value: 'didot', label: 'Didot' },
  { value: 'caslon', label: 'Caslon' },
  { value: 'georgia', label: 'Georgia' },
  { value: 'optima', label: 'Optima' },
]

const fontWeightOptions = [
  { value: 400, label: 'Regular (400)' },
  { value: 500, label: 'Medium (500)' },
  { value: 600, label: 'Semibold (600)' },
  { value: 700, label: 'Bold (700)' },
  { value: 800, label: 'Extra Bold (800)' },
]

export function Settings() {
  const { showToast, setUnsavedChanges } = useUiStore()
  const backendUrl = import.meta.env.VITE_APPS_SCRIPT_URL || ''

  const [autoDateFromPhoto, setAutoDateFromPhoto] = useState(true)
  const [initialAutoDateFromPhoto, setInitialAutoDateFromPhoto] = useState(true)
  const [blurbModeEnabled, setBlurbModeEnabled] = useState(false)
  const [initialBlurbModeEnabled, setInitialBlurbModeEnabled] = useState(false)
  const [blurbMeasurementUnits, setBlurbMeasurementUnits] = useState<'inches' | 'centimeters'>('inches')
  const [initialBlurbMeasurementUnits, setInitialBlurbMeasurementUnits] = useState<'inches' | 'centimeters'>('inches')
  const [blurbBackCoverMosaicMaxPhotos, setBlurbBackCoverMosaicMaxPhotos] = useState(200)
  const [initialBlurbBackCoverMosaicMaxPhotos, setInitialBlurbBackCoverMosaicMaxPhotos] = useState(200)
  const [blurbFormat, setBlurbFormat] = useState<BlurbFormat>('magazine_premium')
  const [initialBlurbFormat, setInitialBlurbFormat] = useState<BlurbFormat>('magazine_premium')
  const [blurbCoverType, setBlurbCoverType] = useState<BlurbCoverType>('softcover')
  const [initialBlurbCoverType, setInitialBlurbCoverType] = useState<BlurbCoverType>('softcover')
  const [blurbPaperType, setBlurbPaperType] = useState<BlurbPaperType>(BLURB_PAPER_TYPES[0])
  const [initialBlurbPaperType, setInitialBlurbPaperType] = useState<BlurbPaperType>(BLURB_PAPER_TYPES[0])
  const [blurbFrontBgColor, setBlurbFrontBgColor] = useState('#ffffff')
  const [initialBlurbFrontBgColor, setInitialBlurbFrontBgColor] = useState('#ffffff')
  const [blurbBackBgColor, setBlurbBackBgColor] = useState('#ffffff')
  const [initialBlurbBackBgColor, setInitialBlurbBackBgColor] = useState('#ffffff')
  const [blurbSpineBgColor, setBlurbSpineBgColor] = useState('#ffffff')
  const [initialBlurbSpineBgColor, setInitialBlurbSpineBgColor] = useState('#ffffff')
  const [blurbBackCoverStyle, setBlurbBackCoverStyle] = useState<'color' | 'mosaic'>('color')
  const [initialBlurbBackCoverStyle, setInitialBlurbBackCoverStyle] = useState<'color' | 'mosaic'>('color')
  const [blurbSpineText, setBlurbSpineText] = useState('')
  const [initialBlurbSpineText, setInitialBlurbSpineText] = useState('')
  const [blurbSpineFontSizeCm, setBlurbSpineFontSizeCm] = useState(0.5)
  const [initialBlurbSpineFontSizeCm, setInitialBlurbSpineFontSizeCm] = useState(0.5)
  // Blurb preview page count - simulation-only, not persisted (Settings has
  // no real interior content to derive a page count from). Defaults to a
  // realistic mid-range count rather than PAGE_COUNT_MIN (20 pages), whose
  // spine is only ~0.16cm wide - too thin for almost any spine text/font
  // size, making the preview look like the spine text is missing/broken.
  const [blurbPreviewPageCount, setBlurbPreviewPageCount] = useState(150)
  const [familyName, setFamilyName] = useState('')
  const [initialFamilyName, setInitialFamilyName] = useState('')
  const [coverTitle, setCoverTitle] = useState('')
  const [initialCoverTitle, setInitialCoverTitle] = useState('')
  const [coverSubtitle, setCoverSubtitle] = useState('')
  const [initialCoverSubtitle, setInitialCoverSubtitle] = useState('')
  const [familyLetterSpacingEm, setFamilyLetterSpacingEm] = useState(0)
  const [initialFamilyLetterSpacingEm, setInitialFamilyLetterSpacingEm] = useState(0)
  const [familyXcm, setFamilyXcm] = useState(5)
  const [initialFamilyXcm, setInitialFamilyXcm] = useState(5)
  const [familyFontFamily, setFamilyFontFamily] = useState('garamond')
  const [initialFamilyFontFamily, setInitialFamilyFontFamily] = useState('garamond')
  const [familyFontWeight, setFamilyFontWeight] = useState(700)
  const [initialFamilyFontWeight, setInitialFamilyFontWeight] = useState(700)
  const [familyScaleX, setFamilyScaleX] = useState(1)
  const [initialFamilyScaleX, setInitialFamilyScaleX] = useState(1)
  const [familyScaleY, setFamilyScaleY] = useState(1)
  const [initialFamilyScaleY, setInitialFamilyScaleY] = useState(1)
  const [familyOutlinePx, setFamilyOutlinePx] = useState(2.2)
  const [initialFamilyOutlinePx, setInitialFamilyOutlinePx] = useState(2.2)
  const [coverTitleXcm, setCoverTitleXcm] = useState(8.5)
  const [initialCoverTitleXcm, setInitialCoverTitleXcm] = useState(8.5)
  const [familyFontCm, setFamilyFontCm] = useState(3.5)
  const [initialFamilyFontCm, setInitialFamilyFontCm] = useState(3.5)
  const [coverTitleFontCm, setCoverTitleFontCm] = useState(0.99)
  const [initialCoverTitleFontCm, setInitialCoverTitleFontCm] = useState(0.99)
  const [coverTitleFontFamily, setCoverTitleFontFamily] = useState('palatino')
  const [initialCoverTitleFontFamily, setInitialCoverTitleFontFamily] = useState('palatino')
  const [coverTitleFontWeight, setCoverTitleFontWeight] = useState(700)
  const [initialCoverTitleFontWeight, setInitialCoverTitleFontWeight] = useState(700)
  const [coverTitleLetterSpacingEm, setCoverTitleLetterSpacingEm] = useState(0)
  const [initialCoverTitleLetterSpacingEm, setInitialCoverTitleLetterSpacingEm] = useState(0)
  const [coverTitleScaleX, setCoverTitleScaleX] = useState(1)
  const [initialCoverTitleScaleX, setInitialCoverTitleScaleX] = useState(1)
  const [coverTitleScaleY, setCoverTitleScaleY] = useState(1)
  const [initialCoverTitleScaleY, setInitialCoverTitleScaleY] = useState(1)
  const [coverSubtitleXcm, setCoverSubtitleXcm] = useState(8.5)
  const [initialCoverSubtitleXcm, setInitialCoverSubtitleXcm] = useState(8.5)
  const [coverSubtitleFontCm, setCoverSubtitleFontCm] = useState(0.85)
  const [initialCoverSubtitleFontCm, setInitialCoverSubtitleFontCm] = useState(0.85)
  const [coverSubtitleFontFamily, setCoverSubtitleFontFamily] = useState('palatino')
  const [initialCoverSubtitleFontFamily, setInitialCoverSubtitleFontFamily] = useState('palatino')
  const [coverSubtitleFontWeight, setCoverSubtitleFontWeight] = useState(700)
  const [initialCoverSubtitleFontWeight, setInitialCoverSubtitleFontWeight] = useState(700)
  const [coverSubtitleLetterSpacingEm, setCoverSubtitleLetterSpacingEm] = useState(0)
  const [initialCoverSubtitleLetterSpacingEm, setInitialCoverSubtitleLetterSpacingEm] = useState(0)
  const [coverSubtitleScaleX, setCoverSubtitleScaleX] = useState(1)
  const [initialCoverSubtitleScaleX, setInitialCoverSubtitleScaleX] = useState(1)
  const [coverSubtitleScaleY, setCoverSubtitleScaleY] = useState(1)
  const [initialCoverSubtitleScaleY, setInitialCoverSubtitleScaleY] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [logsLoading, setLogsLoading] = useState(true)
  const [logsMin, setLogsMin] = useState<number | null>(null)
  const [logsMax, setLogsMax] = useState<number | null>(null)
  const [logsFrom, setLogsFrom] = useState<number | null>(null)
  const [logsTo, setLogsTo] = useState<number | null>(null)
  const [famileoLogsLoading, setFamileoLogsLoading] = useState(true)
  const [famileoLogsMin, setFamileoLogsMin] = useState<number | null>(null)
  const [famileoLogsMax, setFamileoLogsMax] = useState<number | null>(null)
  const [famileoLogsFrom, setFamileoLogsFrom] = useState<number | null>(null)
  const [famileoLogsTo, setFamileoLogsTo] = useState<number | null>(null)
  const [isClearingLogs, setIsClearingLogs] = useState(false)
  const [clearProgress, setClearProgress] = useState(0)
  const [isClearingFamileoLogs, setIsClearingFamileoLogs] = useState(false)
  const [famileoClearProgress, setFamileoClearProgress] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFileId, setPreviewFileId] = useState<string | null>(null)
  // Which preview is currently in flight (for that button's own "Generating..."
  // state) vs which one the current previewUrl/previewFileId result belongs to
  // (normal and Blurb previews share the same single-slot result state, so
  // each button only shows the result view when it's the one that produced it).
  const [previewLoadingMode, setPreviewLoadingMode] = useState<'normal' | 'blurb' | null>(null)
  const [previewResultMode, setPreviewResultMode] = useState<'normal' | 'blurb' | null>(null)
  const [isBackfilling, setIsBackfilling] = useState(false)
  const [isRefreshingMergeToken, setIsRefreshingMergeToken] = useState(false)
  const [mergeTokenStatus, setMergeTokenStatus] = useState<{
    configured: boolean
    has_refresh_token?: boolean
    has_access_token?: boolean
    expiry?: string
    client_id_suffix?: string
    parse_error?: boolean
  } | null>(null)
  const [usersLoading, setUsersLoading] = useState(false)
  const [users, setUsers] = useState<DeclaredUser[]>([])
  const isDirty = autoDateFromPhoto !== initialAutoDateFromPhoto
    || blurbModeEnabled !== initialBlurbModeEnabled
    || blurbMeasurementUnits !== initialBlurbMeasurementUnits
    || blurbBackCoverMosaicMaxPhotos !== initialBlurbBackCoverMosaicMaxPhotos
    || blurbFormat !== initialBlurbFormat
    || blurbCoverType !== initialBlurbCoverType
    || blurbPaperType !== initialBlurbPaperType
    || blurbFrontBgColor !== initialBlurbFrontBgColor
    || blurbBackBgColor !== initialBlurbBackBgColor
    || blurbSpineBgColor !== initialBlurbSpineBgColor
    || blurbBackCoverStyle !== initialBlurbBackCoverStyle
    || blurbSpineText !== initialBlurbSpineText
    || blurbSpineFontSizeCm !== initialBlurbSpineFontSizeCm
    || familyName.trim() !== initialFamilyName.trim()
    || coverTitle.trim() !== initialCoverTitle.trim()
    || coverSubtitle.trim() !== initialCoverSubtitle.trim()
    || familyLetterSpacingEm !== initialFamilyLetterSpacingEm
    || familyXcm !== initialFamilyXcm
    || familyFontFamily !== initialFamilyFontFamily
    || familyFontWeight !== initialFamilyFontWeight
    || familyFontCm !== initialFamilyFontCm
    || familyScaleX !== initialFamilyScaleX
    || familyScaleY !== initialFamilyScaleY
    || familyOutlinePx !== initialFamilyOutlinePx
    || coverTitleXcm !== initialCoverTitleXcm
    || coverTitleFontCm !== initialCoverTitleFontCm
    || coverTitleFontFamily !== initialCoverTitleFontFamily
    || coverTitleFontWeight !== initialCoverTitleFontWeight
    || coverTitleLetterSpacingEm !== initialCoverTitleLetterSpacingEm
    || coverTitleScaleX !== initialCoverTitleScaleX
    || coverTitleScaleY !== initialCoverTitleScaleY
    || coverSubtitleXcm !== initialCoverSubtitleXcm
    || coverSubtitleFontCm !== initialCoverSubtitleFontCm
    || coverSubtitleFontFamily !== initialCoverSubtitleFontFamily
    || coverSubtitleFontWeight !== initialCoverSubtitleFontWeight
    || coverSubtitleLetterSpacingEm !== initialCoverSubtitleLetterSpacingEm
    || coverSubtitleScaleX !== initialCoverSubtitleScaleX
    || coverSubtitleScaleY !== initialCoverSubtitleScaleY

  // Settings has no real interior content, so the Blurb preview's spine
  // estimate is driven by the manual page-count slider rather than actual
  // generated pages - simulation only, never affects a real export.
  const previewSpineWidthIn = spineWidthIn(blurbPreviewPageCount, blurbCoverType, blurbPaperType)
  const previewSpineTextFits = Boolean(blurbSpineText.trim())
    && previewSpineWidthIn * 2.54 >= Math.max(blurbSpineFontSizeCm, 0.3)

  useEffect(() => {
    loadConfig()
    loadAutoDateSetting()
    loadBlurbSettings()
    loadLogsRange()
    loadFamileoLogsRange()
    loadUsers()
    cleanupStaleCoverPreview()
    loadMergeTokenStatus()
  }, [])

  const loadAutoDateSetting = async () => {
    try {
      const result = await configApi.get('auto_date_from_photo')
      const value = result.value !== 'false'
      setAutoDateFromPhoto(value)
      setInitialAutoDateFromPhoto(value)
    } catch {
      // keep default (enabled)
    }
  }

  const loadBlurbSettings = async () => {
    try {
      const [
        modeResult, unitsResult, mosaicCapResult,
        formatResult, coverTypeResult, paperTypeResult,
        frontBgResult, backBgResult, spineBgResult,
        backStyleResult, spineTextResult, spineFontResult,
      ] = await Promise.all([
        configApi.get('blurb_mode_enabled'),
        configApi.get('blurb_measurement_units'),
        configApi.get('blurb_back_cover_mosaic_max_photos'),
        configApi.get('blurb_format'),
        configApi.get('blurb_cover_type'),
        configApi.get('blurb_paper_type'),
        configApi.get('blurb_front_bg_color'),
        configApi.get('blurb_back_bg_color'),
        configApi.get('blurb_spine_bg_color'),
        configApi.get('blurb_back_cover_style'),
        configApi.get('blurb_spine_text'),
        configApi.get('blurb_spine_font_size_cm'),
      ])
      const modeValue = modeResult.value === 'true'
      setBlurbModeEnabled(modeValue)
      setInitialBlurbModeEnabled(modeValue)
      const unitsValue = unitsResult.value === 'centimeters' ? 'centimeters' : 'inches'
      setBlurbMeasurementUnits(unitsValue)
      setInitialBlurbMeasurementUnits(unitsValue)
      const mosaicCapNum = Number.isFinite(parseInt(mosaicCapResult.value || '', 10))
        ? parseInt(mosaicCapResult.value || '200', 10)
        : 200
      setBlurbBackCoverMosaicMaxPhotos(mosaicCapNum)
      setInitialBlurbBackCoverMosaicMaxPhotos(mosaicCapNum)

      const formatValue: BlurbFormat = formatResult.value === 'standard_portrait' ? 'standard_portrait' : 'magazine_premium'
      setBlurbFormat(formatValue)
      setInitialBlurbFormat(formatValue)
      const coverTypeValue: BlurbCoverType = coverTypeResult.value === 'hardcover' ? 'hardcover' : 'softcover'
      setBlurbCoverType(coverTypeValue)
      setInitialBlurbCoverType(coverTypeValue)
      const paperTypeValue = (paperTypeResult.value as BlurbPaperType) || BLURB_PAPER_TYPES[0]
      setBlurbPaperType(paperTypeValue)
      setInitialBlurbPaperType(paperTypeValue)
      const frontBgValue = frontBgResult.value || '#ffffff'
      setBlurbFrontBgColor(frontBgValue)
      setInitialBlurbFrontBgColor(frontBgValue)
      const backBgValue = backBgResult.value || '#ffffff'
      setBlurbBackBgColor(backBgValue)
      setInitialBlurbBackBgColor(backBgValue)
      const spineBgValue = spineBgResult.value || '#ffffff'
      setBlurbSpineBgColor(spineBgValue)
      setInitialBlurbSpineBgColor(spineBgValue)
      const backStyleValue: 'color' | 'mosaic' = backStyleResult.value === 'mosaic' ? 'mosaic' : 'color'
      setBlurbBackCoverStyle(backStyleValue)
      setInitialBlurbBackCoverStyle(backStyleValue)
      const spineTextValue = spineTextResult.value || ''
      setBlurbSpineText(spineTextValue)
      setInitialBlurbSpineText(spineTextValue)
      const spineFontValue = spineFontResult.value ? Number(spineFontResult.value) : 0.5
      setBlurbSpineFontSizeCm(spineFontValue)
      setInitialBlurbSpineFontSizeCm(spineFontValue)
    } catch {
      // keep defaults (Blurb mode off, inches, 200-photo cap, Magazine Premium/Softcover/white/color)
    }
  }

  const loadConfig = async () => {
    try {
      const [
        familyResult,
        titleResult,
        subtitleResult,
        spacingResult,
        familyXResult,
        familyFontFamilyResult,
        familyFontWeightResult,
        familyFontSizeResult,
        familyScaleXResult,
        familyScaleYResult,
        familyOutlineResult,
        titleFontFamilyResult,
        titleFontWeightResult,
        titleLetterSpacingResult,
        titleScaleXResult,
        titleScaleYResult,
        subtitleFontFamilyResult,
        subtitleFontWeightResult,
        subtitleLetterSpacingResult,
        subtitleScaleXResult,
        subtitleScaleYResult,
        titleXResult,
        titleFontResult,
        subtitleXResult,
        subtitleFontResult,
      ] = await Promise.all([
        configApi.get('family_name'),
        configApi.get('pdf_cover_title'),
        configApi.get('pdf_cover_subtitle'),
        configApi.get('pdf_cover_vertical_letter_spacing'),
        configApi.get('pdf_cover_family_x_cm'),
        configApi.get('pdf_cover_family_font_family'),
        configApi.get('pdf_cover_family_font_weight'),
        configApi.get('pdf_cover_family_h_cm'),
        configApi.get('pdf_cover_family_scale_x'),
        configApi.get('pdf_cover_family_scale_y'),
        configApi.get('pdf_cover_family_outline_px'),
        configApi.get('pdf_cover_title_font_family'),
        configApi.get('pdf_cover_title_font_weight'),
        configApi.get('pdf_cover_title_letter_spacing_em'),
        configApi.get('pdf_cover_title_scale_x'),
        configApi.get('pdf_cover_title_scale_y'),
        configApi.get('pdf_cover_subtitle_font_family'),
        configApi.get('pdf_cover_subtitle_font_weight'),
        configApi.get('pdf_cover_subtitle_letter_spacing_em'),
        configApi.get('pdf_cover_subtitle_scale_x'),
        configApi.get('pdf_cover_subtitle_scale_y'),
        configApi.get('pdf_cover_title_x_cm'),
        configApi.get('pdf_cover_title_h_cm'),
        configApi.get('pdf_cover_subtitle_x_cm'),
        configApi.get('pdf_cover_subtitle_h_cm'),
      ])
      const familyValue = familyResult.value || ''
      const titleValue = titleResult.value || ''
      const subtitleValue = subtitleResult.value || ''
      const spacingValue = spacingResult.value || '0'
      const familyXValue = familyXResult.value || ''
      const familyFontFamilyValue = familyFontFamilyResult.value || 'garamond'
      const familyFontWeightValue = familyFontWeightResult.value || '700'
      const familyFontSizeValue = familyFontSizeResult.value || '3.5'
      const familyScaleXValue = familyScaleXResult.value || '1'
      const familyScaleYValue = familyScaleYResult.value || '1'
      const familyOutlineValue = familyOutlineResult.value || ''
      const titleFontFamilyValue = titleFontFamilyResult.value || 'palatino'
      const titleFontWeightValue = titleFontWeightResult.value || '700'
      const titleLetterSpacingValue = titleLetterSpacingResult.value || '0'
      const titleScaleXValue = titleScaleXResult.value || '1'
      const titleScaleYValue = titleScaleYResult.value || '1'
      const subtitleFontFamilyValue = subtitleFontFamilyResult.value || 'palatino'
      const subtitleFontWeightValue = subtitleFontWeightResult.value || '700'
      const subtitleLetterSpacingValue = subtitleLetterSpacingResult.value || '0'
      const subtitleScaleXValue = subtitleScaleXResult.value || '1'
      const subtitleScaleYValue = subtitleScaleYResult.value || '1'
      const titleXValue = titleXResult.value || ''
      const titleFontValue = titleFontResult.value || ''
      const subtitleXValue = subtitleXResult.value || ''
      const subtitleFontValue = subtitleFontResult.value || ''
      setFamilyName(familyValue)
      setInitialFamilyName(familyValue)
      setCoverTitle(titleValue)
      setInitialCoverTitle(titleValue)
      setCoverSubtitle(subtitleValue)
      setInitialCoverSubtitle(subtitleValue)
      const spacingNum = Number.isFinite(parseFloat(spacingValue)) ? parseFloat(spacingValue) : 0
      setFamilyLetterSpacingEm(spacingNum)
      setInitialFamilyLetterSpacingEm(spacingNum)
      const familyXNum = Number.isFinite(parseFloat(familyXValue)) ? parseFloat(familyXValue) : 5
      setFamilyXcm(familyXNum)
      setInitialFamilyXcm(familyXNum)
      setFamilyFontFamily(familyFontFamilyValue)
      setInitialFamilyFontFamily(familyFontFamilyValue)
      const familyWeightNum = Number.isFinite(parseFloat(familyFontWeightValue))
        ? parseFloat(familyFontWeightValue)
        : 700
      setFamilyFontWeight(familyWeightNum)
      setInitialFamilyFontWeight(familyWeightNum)
      const familyFontSizeNum = Number.isFinite(parseFloat(familyFontSizeValue))
        ? parseFloat(familyFontSizeValue)
        : 3.5
      setFamilyFontCm(familyFontSizeNum)
      setInitialFamilyFontCm(familyFontSizeNum)
      const familyScaleXNum = Number.isFinite(parseFloat(familyScaleXValue))
        ? parseFloat(familyScaleXValue)
        : 1
      setFamilyScaleX(familyScaleXNum)
      setInitialFamilyScaleX(familyScaleXNum)
      const familyScaleYNum = Number.isFinite(parseFloat(familyScaleYValue))
        ? parseFloat(familyScaleYValue)
        : 1
      setFamilyScaleY(familyScaleYNum)
      setInitialFamilyScaleY(familyScaleYNum)
      const familyOutlineNum = Number.isFinite(parseFloat(familyOutlineValue))
        ? parseFloat(familyOutlineValue)
        : Math.min(2.2, Math.max(0.8, familyFontSizeNum * 100 * 0.007))
      setFamilyOutlinePx(familyOutlineNum)
      setInitialFamilyOutlinePx(familyOutlineNum)
      setCoverTitleFontFamily(titleFontFamilyValue)
      setInitialCoverTitleFontFamily(titleFontFamilyValue)
      const titleWeightNum = Number.isFinite(parseFloat(titleFontWeightValue))
        ? parseFloat(titleFontWeightValue)
        : 700
      setCoverTitleFontWeight(titleWeightNum)
      setInitialCoverTitleFontWeight(titleWeightNum)
      const titleLetterSpacingNum = Number.isFinite(parseFloat(titleLetterSpacingValue))
        ? parseFloat(titleLetterSpacingValue)
        : 0
      setCoverTitleLetterSpacingEm(titleLetterSpacingNum)
      setInitialCoverTitleLetterSpacingEm(titleLetterSpacingNum)
      const titleScaleXNum = Number.isFinite(parseFloat(titleScaleXValue))
        ? parseFloat(titleScaleXValue)
        : 1
      setCoverTitleScaleX(titleScaleXNum)
      setInitialCoverTitleScaleX(titleScaleXNum)
      const titleScaleYNum = Number.isFinite(parseFloat(titleScaleYValue))
        ? parseFloat(titleScaleYValue)
        : 1
      setCoverTitleScaleY(titleScaleYNum)
      setInitialCoverTitleScaleY(titleScaleYNum)
      setCoverSubtitleFontFamily(subtitleFontFamilyValue)
      setInitialCoverSubtitleFontFamily(subtitleFontFamilyValue)
      const subtitleWeightNum = Number.isFinite(parseFloat(subtitleFontWeightValue))
        ? parseFloat(subtitleFontWeightValue)
        : 700
      setCoverSubtitleFontWeight(subtitleWeightNum)
      setInitialCoverSubtitleFontWeight(subtitleWeightNum)
      const subtitleLetterSpacingNum = Number.isFinite(parseFloat(subtitleLetterSpacingValue))
        ? parseFloat(subtitleLetterSpacingValue)
        : 0
      setCoverSubtitleLetterSpacingEm(subtitleLetterSpacingNum)
      setInitialCoverSubtitleLetterSpacingEm(subtitleLetterSpacingNum)
      const subtitleScaleXNum = Number.isFinite(parseFloat(subtitleScaleXValue))
        ? parseFloat(subtitleScaleXValue)
        : 1
      setCoverSubtitleScaleX(subtitleScaleXNum)
      setInitialCoverSubtitleScaleX(subtitleScaleXNum)
      const subtitleScaleYNum = Number.isFinite(parseFloat(subtitleScaleYValue))
        ? parseFloat(subtitleScaleYValue)
        : 1
      setCoverSubtitleScaleY(subtitleScaleYNum)
      setInitialCoverSubtitleScaleY(subtitleScaleYNum)
      const titleXNum = Number.isFinite(parseFloat(titleXValue)) ? parseFloat(titleXValue) : 8.5
      setCoverTitleXcm(titleXNum)
      setInitialCoverTitleXcm(titleXNum)
      const titleFontNum = Number.isFinite(parseFloat(titleFontValue)) ? parseFloat(titleFontValue) : 0.99
      setCoverTitleFontCm(titleFontNum)
      setInitialCoverTitleFontCm(titleFontNum)
      const subtitleXNum = Number.isFinite(parseFloat(subtitleXValue)) ? parseFloat(subtitleXValue) : 8.5
      setCoverSubtitleXcm(subtitleXNum)
      setInitialCoverSubtitleXcm(subtitleXNum)
      const subtitleFontNum = Number.isFinite(parseFloat(subtitleFontValue)) ? parseFloat(subtitleFontValue) : 0.85
      setCoverSubtitleFontCm(subtitleFontNum)
      setInitialCoverSubtitleFontCm(subtitleFontNum)
    } catch (error) {
      showToast('Error while loading', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  const cleanupStaleCoverPreview = async () => {
    try {
      const fileId = localStorage.getItem('cover_preview_file_id')
      if (!fileId) return
      await pdfApi.deleteCoverPreview(fileId)
    } catch {
      // ignore
    } finally {
      localStorage.removeItem('cover_preview_file_id')
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const nextValue = familyName.trim()
      const nextTitle = coverTitle.trim()
      const nextSubtitle = coverSubtitle.trim()
      await Promise.all([
        configApi.set('auto_date_from_photo', String(autoDateFromPhoto)),
        configApi.set('blurb_mode_enabled', String(blurbModeEnabled)),
        configApi.set('blurb_measurement_units', blurbMeasurementUnits),
        configApi.set('blurb_back_cover_mosaic_max_photos', String(blurbBackCoverMosaicMaxPhotos)),
        configApi.set('blurb_format', blurbFormat),
        configApi.set('blurb_cover_type', blurbCoverType),
        configApi.set('blurb_paper_type', blurbPaperType),
        configApi.set('blurb_front_bg_color', blurbFrontBgColor),
        configApi.set('blurb_back_bg_color', blurbBackBgColor),
        configApi.set('blurb_spine_bg_color', blurbSpineBgColor),
        configApi.set('blurb_back_cover_style', blurbBackCoverStyle),
        configApi.set('blurb_spine_text', blurbSpineText.trim()),
        configApi.set('blurb_spine_font_size_cm', String(blurbSpineFontSizeCm)),
        configApi.set('family_name', nextValue),
        configApi.set('pdf_cover_title', nextTitle),
        configApi.set('pdf_cover_subtitle', nextSubtitle),
        configApi.set('pdf_cover_vertical_letter_spacing', String(familyLetterSpacingEm)),
        configApi.set('pdf_cover_family_x_cm', String(familyXcm)),
        configApi.set('pdf_cover_family_font_family', familyFontFamily),
        configApi.set('pdf_cover_family_font_weight', String(familyFontWeight)),
        configApi.set('pdf_cover_family_h_cm', String(familyFontCm)),
        configApi.set('pdf_cover_family_scale_x', String(familyScaleX)),
        configApi.set('pdf_cover_family_scale_y', String(familyScaleY)),
        configApi.set('pdf_cover_family_outline_px', String(familyOutlinePx)),
        configApi.set('pdf_cover_title_font_family', coverTitleFontFamily),
        configApi.set('pdf_cover_title_font_weight', String(coverTitleFontWeight)),
        configApi.set('pdf_cover_title_letter_spacing_em', String(coverTitleLetterSpacingEm)),
        configApi.set('pdf_cover_title_scale_x', String(coverTitleScaleX)),
        configApi.set('pdf_cover_title_scale_y', String(coverTitleScaleY)),
        configApi.set('pdf_cover_title_x_cm', String(coverTitleXcm)),
        configApi.set('pdf_cover_title_h_cm', String(coverTitleFontCm)),
        configApi.set('pdf_cover_subtitle_font_family', coverSubtitleFontFamily),
        configApi.set('pdf_cover_subtitle_font_weight', String(coverSubtitleFontWeight)),
        configApi.set('pdf_cover_subtitle_letter_spacing_em', String(coverSubtitleLetterSpacingEm)),
        configApi.set('pdf_cover_subtitle_scale_x', String(coverSubtitleScaleX)),
        configApi.set('pdf_cover_subtitle_scale_y', String(coverSubtitleScaleY)),
        configApi.set('pdf_cover_subtitle_x_cm', String(coverSubtitleXcm)),
        configApi.set('pdf_cover_subtitle_h_cm', String(coverSubtitleFontCm)),
      ])
      setInitialAutoDateFromPhoto(autoDateFromPhoto)
      setInitialBlurbModeEnabled(blurbModeEnabled)
      setInitialBlurbMeasurementUnits(blurbMeasurementUnits)
      setInitialBlurbBackCoverMosaicMaxPhotos(blurbBackCoverMosaicMaxPhotos)
      setInitialBlurbFormat(blurbFormat)
      setInitialBlurbCoverType(blurbCoverType)
      setInitialBlurbPaperType(blurbPaperType)
      setInitialBlurbFrontBgColor(blurbFrontBgColor)
      setInitialBlurbBackBgColor(blurbBackBgColor)
      setInitialBlurbSpineBgColor(blurbSpineBgColor)
      setInitialBlurbBackCoverStyle(blurbBackCoverStyle)
      setBlurbSpineText(blurbSpineText.trim())
      setInitialBlurbSpineText(blurbSpineText.trim())
      setInitialBlurbSpineFontSizeCm(blurbSpineFontSizeCm)
      setFamilyName(nextValue)
      setInitialFamilyName(nextValue)
      setCoverTitle(nextTitle)
      setInitialCoverTitle(nextTitle)
      setCoverSubtitle(nextSubtitle)
      setInitialCoverSubtitle(nextSubtitle)
      setInitialFamilyLetterSpacingEm(familyLetterSpacingEm)
      setInitialFamilyXcm(familyXcm)
      setInitialFamilyFontFamily(familyFontFamily)
      setInitialFamilyFontWeight(familyFontWeight)
      setInitialFamilyFontCm(familyFontCm)
      setInitialFamilyScaleX(familyScaleX)
      setInitialFamilyScaleY(familyScaleY)
      setInitialFamilyOutlinePx(familyOutlinePx)
      setInitialCoverTitleXcm(coverTitleXcm)
      setInitialCoverTitleFontCm(coverTitleFontCm)
      setInitialCoverTitleFontFamily(coverTitleFontFamily)
      setInitialCoverTitleFontWeight(coverTitleFontWeight)
      setInitialCoverTitleLetterSpacingEm(coverTitleLetterSpacingEm)
      setInitialCoverTitleScaleX(coverTitleScaleX)
      setInitialCoverTitleScaleY(coverTitleScaleY)
      setInitialCoverSubtitleXcm(coverSubtitleXcm)
      setInitialCoverSubtitleFontCm(coverSubtitleFontCm)
      setInitialCoverSubtitleFontFamily(coverSubtitleFontFamily)
      setInitialCoverSubtitleFontWeight(coverSubtitleFontWeight)
      setInitialCoverSubtitleLetterSpacingEm(coverSubtitleLetterSpacingEm)
      setInitialCoverSubtitleScaleX(coverSubtitleScaleX)
      setInitialCoverSubtitleScaleY(coverSubtitleScaleY)
      showToast('Configuration saved', 'success')
    } catch (error) {
      showToast('Error while saving', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleOpenCoverPreview = async (mode: 'normal' | 'blurb') => {
    setPreviewLoadingMode(mode)
    try {
      const response = await pdfApi.previewCover({
        from: new Date().toISOString().slice(0, 10),
        to: new Date().toISOString().slice(0, 10),
        options: {
          cover_style: 'masked-title',
          max_mosaic_photos: 0,
          preview_solid: true,
          family_name: familyName.trim(),
          cover_title: coverTitle.trim(),
          cover_subtitle: coverSubtitle.trim(),
          cover_vertical_letter_spacing_em: familyLetterSpacingEm,
          cover_family_x_cm: familyXcm,
          cover_family_font_family: familyFontFamily,
          cover_family_font_weight: familyFontWeight,
          cover_family_letter_spacing_em: familyLetterSpacingEm,
          cover_family_h_cm: familyFontCm,
          cover_family_scale_x: familyScaleX,
          cover_family_scale_y: familyScaleY,
          cover_family_outline_px: familyOutlinePx,
          cover_title_font_family: coverTitleFontFamily,
          cover_title_font_weight: coverTitleFontWeight,
          cover_title_letter_spacing_em: coverTitleLetterSpacingEm,
          cover_title_scale_x: coverTitleScaleX,
          cover_title_scale_y: coverTitleScaleY,
          cover_title_x_cm: coverTitleXcm,
          cover_title_h_cm: coverTitleFontCm,
          cover_subtitle_font_family: coverSubtitleFontFamily,
          cover_subtitle_font_weight: coverSubtitleFontWeight,
          cover_subtitle_letter_spacing_em: coverSubtitleLetterSpacingEm,
          cover_subtitle_scale_x: coverSubtitleScaleX,
          cover_subtitle_scale_y: coverSubtitleScaleY,
          cover_subtitle_x_cm: coverSubtitleXcm,
          cover_subtitle_h_cm: coverSubtitleFontCm,
          ...(mode === 'blurb' ? {
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
            blurb_preview_page_count: blurbPreviewPageCount,
          } : {}),
        },
      })
      setPreviewFileId(response.file_id)
      localStorage.setItem('cover_preview_file_id', response.file_id)

      const deadline = Date.now() + 2 * 60 * 1000
      while (true) {
        const status = await pdfApi.previewStatus(response.file_id)
        if (status.status === 'DONE') break
        if (status.status === 'ERROR') {
          throw new Error(status.error_message || 'Preview generation failed')
        }
        if (Date.now() > deadline) {
          throw new Error('Preview generation timed out')
        }
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }

      const content = await pdfApi.previewCoverContent(response.file_id)
      const byteCharacters = atob(content.base64)
      const bytes = new Uint8Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        bytes[i] = byteCharacters.charCodeAt(i)
      }
      const blob = new Blob([bytes.buffer], { type: content.mime_type || 'application/pdf' })
      const url = URL.createObjectURL(blob)
      setPreviewUrl(url)
      setPreviewResultMode(mode)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Preview failed', 'error')
    } finally {
      setPreviewLoadingMode(null)
    }
  }

  const handleClosePreview = async () => {
    const fileId = previewFileId
    const url = previewUrl
    setPreviewUrl(null)
    setPreviewFileId(null)
    setPreviewResultMode(null)
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url)
    }
    if (fileId) {
      try {
        await pdfApi.deleteCoverPreview(fileId)
      } catch {
        // ignore
      }
    }
    localStorage.removeItem('cover_preview_file_id')
  }


  const loadLogsRange = async () => {
    setLogsLoading(true)
    try {
      const range = await logsApi.getPdfRange()
      const minMs = range.min ? new Date(range.min).getTime() : null
      const maxMs = range.max ? new Date(range.max).getTime() : null
      setLogsMin(minMs)
      setLogsMax(maxMs)
      setLogsFrom(minMs)
      setLogsTo(maxMs)
    } catch (error) {
      showToast('Failed to load logs range', 'error')
    } finally {
      setLogsLoading(false)
    }
  }

  const loadFamileoLogsRange = async () => {
    setFamileoLogsLoading(true)
    try {
      const range = await logsApi.getFamileoRange()
      const minMs = range.min ? new Date(range.min).getTime() : null
      const maxMs = range.max ? new Date(range.max).getTime() : null
      setFamileoLogsMin(minMs)
      setFamileoLogsMax(maxMs)
      setFamileoLogsFrom(minMs)
      setFamileoLogsTo(maxMs)
    } catch (error) {
      showToast('Failed to load Famileo logs range', 'error')
    } finally {
      setFamileoLogsLoading(false)
    }
  }

  const handleClearLogs = async () => {
    if (logsFrom === null || logsTo === null) return
    setIsClearingLogs(true)
    setClearProgress(0)

    const start = Date.now()
    const timer = setInterval(() => {
      const elapsed = Date.now() - start
      const next = Math.min(90, Math.floor((elapsed / 3000) * 90))
      setClearProgress(next)
    }, 150)

    try {
      const fromIso = new Date(logsFrom).toISOString()
      const toIso = new Date(logsTo).toISOString()
      const result = await logsApi.clearPdfRange(fromIso, toIso)
      setClearProgress(100)
      showToast(`Logs deleted: ${result.deleted}`, 'success')
      await loadLogsRange()
    } catch (error) {
      showToast('Failed to clear logs', 'error')
    } finally {
      clearInterval(timer)
      setTimeout(() => {
        setIsClearingLogs(false)
        setClearProgress(0)
      }, 300)
    }
  }

  const handleClearFamileoLogs = async () => {
    if (famileoLogsFrom === null || famileoLogsTo === null) return
    setIsClearingFamileoLogs(true)
    setFamileoClearProgress(0)

    const start = Date.now()
    const timer = setInterval(() => {
      const elapsed = Date.now() - start
      const next = Math.min(90, Math.floor((elapsed / 3000) * 90))
      setFamileoClearProgress(next)
    }, 150)

    try {
      const fromIso = new Date(famileoLogsFrom).toISOString()
      const toIso = new Date(famileoLogsTo).toISOString()
      const result = await logsApi.clearFamileoRange(fromIso, toIso)
      setFamileoClearProgress(100)
      showToast(`Famileo logs deleted: ${result.deleted}`, 'success')
      await loadFamileoLogsRange()
    } catch (error) {
      showToast('Failed to clear Famileo logs', 'error')
    } finally {
      clearInterval(timer)
      setTimeout(() => {
        setIsClearingFamileoLogs(false)
        setFamileoClearProgress(0)
      }, 300)
    }
  }

  const handleBackfillFingerprints = async () => {
    setIsBackfilling(true)
    try {
      const result = await articlesApi.backfillFamileoFingerprints()
      showToast(`Backfill done: ${result.updated}/${result.total}`, 'success')
    } catch (error) {
      showToast('Failed to backfill fingerprints', 'error')
    } finally {
      setIsBackfilling(false)
    }
  }

  const loadUsers = async () => {
    setUsersLoading(true)
    try {
      const response = await usersApi.list()
      setUsers(response.users || [])
    } catch (error) {
      showToast('Failed to load users', 'error')
    } finally {
      setUsersLoading(false)
    }
  }

  const loadMergeTokenStatus = async () => {
    try {
      const status = await pdfApi.mergeTokenStatus()
      setMergeTokenStatus(status)
    } catch (error) {
      setMergeTokenStatus(null)
    }
  }

  const handleRefreshMergeToken = async () => {
    setIsRefreshingMergeToken(true)
    try {
      const result = await pdfApi.refreshMergeToken()
      await loadMergeTokenStatus()
      showToast(
        result.expiry
          ? `Merge token refreshed (expires ${new Date(result.expiry).toLocaleString('fr-FR')})`
          : 'Merge token refreshed',
        'success'
      )
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to refresh merge token', 'error')
    } finally {
      setIsRefreshingMergeToken(false)
    }
  }

  const formatDateFr = (ms: number | null) => {
    if (ms === null) return '--'
    return new Date(ms).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  useEffect(() => {
    setUnsavedChanges(isDirty)
  }, [isDirty, setUnsavedChanges])

  const formatUserDate = (value: string) => {
    if (!value) return '--'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '--'
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  const normalizeAvatarUrl = (url: string) => {
    if (!url) return ''
    if (url.includes('drive.google.com/thumbnail')) return url
    const patterns = [
      /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/,
      /drive\.google\.com\/uc\?.*id=([A-Za-z0-9_-]+)/,
      /drive\.google\.com\/open\?.*id=([A-Za-z0-9_-]+)/,
      /lh3\.googleusercontent\.com\/d\/([A-Za-z0-9_-]+)/,
    ]
    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match && match[1]) {
        return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w200`
      }
    }
    return url
  }

  const UserAvatar = ({ user }: { user: DeclaredUser }) => {
    const { src, isLoading, error } = useImageLoader(user.avatar_url, user.avatar_file_id)
    if (isLoading) {
      return (
        <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-200 animate-pulse" />
      )
    }
    if (error || !src) {
      return (
        <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-[10px] text-gray-500">
          --
        </div>
      )
    }
    return (
      <img
        src={src || normalizeAvatarUrl(user.avatar_url)}
        alt={user.pseudo || user.email}
        className="w-7 h-7 rounded-full object-cover border border-gray-200"
      />
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />

      {/* Content */}
      <div className="flex-1 p-4 space-y-6 pb-32 max-w-content mx-auto w-full">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center">
              <Spinner size="lg" />
              <p className="mt-4 text-gray-600">Loading...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Declared users */}
            <CollapsibleSection
              title="Declared users"
              headerExtra={
                <button
                  onClick={loadUsers}
                  disabled={usersLoading}
                  className="text-xs text-primary-600 hover:text-primary-700"
                >
                  Refresh
                </button>
              }
            >
              {usersLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Spinner size="md" />
                </div>
              ) : users.length === 0 ? (
                <p className="text-sm text-gray-500">No users found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="text-gray-500">
                      <tr className="text-left">
                        <th className="py-2 pr-3">Avatar</th>
                        <th className="py-2 pr-3">Email</th>
                        <th className="py-2 pr-3">Pseudo</th>
                        <th className="py-2 pr-3">Famileo</th>
                        <th className="py-2 pr-3">Created</th>
                        <th className="py-2 pr-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-700">
                      {users.map((u) => (
                        <tr key={u.email} className="border-t border-gray-100">
                          <td className="py-2 pr-3">
                            <UserAvatar user={u} />
                          </td>
                          <td className="py-2 pr-3">{u.email}</td>
                          <td className="py-2 pr-3">{u.pseudo || '--'}</td>
                          <td className="py-2 pr-3">{u.famileo_name || '--'}</td>
                          <td className="py-2 pr-3">{formatUserDate(u.date_created)}</td>
                          <td className="py-2 pr-3">{u.status || '--'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CollapsibleSection>

            {/* Article editor */}
            <CollapsibleSection title="Article editor">
              <label className="flex items-center gap-3 cursor-pointer p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <input
                  type="checkbox"
                  checked={autoDateFromPhoto}
                  onChange={(e) => setAutoDateFromPhoto(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">Auto-set date from photo</span>
                  <p className="text-xs text-gray-500">When creating a new article, use the selected photo's date instead of today's date</p>
                </div>
              </label>
            </CollapsibleSection>

            {/* Blurb print-ready mode */}
            <CollapsibleSection title="Blurb print-ready mode">
              <label className="flex items-center gap-3 cursor-pointer p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <input
                  type="checkbox"
                  checked={blurbModeEnabled}
                  onChange={(e) => setBlurbModeEnabled(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">Enable Blurb mode</span>
                  <p className="text-xs text-gray-500">Show print-ready cover parameters below and the Normal/Blurb/Both choice in the PDF export flow</p>
                </div>
              </label>
              {blurbModeEnabled && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Measurement units</label>
                    <div className="flex rounded-lg border border-gray-300 overflow-hidden max-w-xs">
                      <button
                        type="button"
                        onClick={() => setBlurbMeasurementUnits('inches')}
                        className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                          blurbMeasurementUnits === 'inches'
                            ? 'bg-primary-600 text-white'
                            : 'bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        Inches
                      </button>
                      <button
                        type="button"
                        onClick={() => setBlurbMeasurementUnits('centimeters')}
                        className={`flex-1 px-3 py-2 text-sm font-medium border-l border-gray-300 transition-colors ${
                          blurbMeasurementUnits === 'centimeters'
                            ? 'bg-primary-600 text-white'
                            : 'bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        Centimeters
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Calculations always use RPI Print's inch-based values - centimeters are a rounded display conversion only.
                    </p>
                  </div>
                  <div>
                    <Input
                      label="Back cover mosaic max photos"
                      type="number"
                      value={String(blurbBackCoverMosaicMaxPhotos)}
                      onChange={(e) => {
                        const next = parseInt(e.target.value, 10)
                        setBlurbBackCoverMosaicMaxPhotos(Number.isFinite(next) ? next : 200)
                      }}
                      className="max-w-xs"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Caps how many photos the full-album back-cover mosaic uses. Use -1 for no cap (every photo in the exported date range).
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Book format</label>
                    <div className="flex gap-2">
                      {(Object.keys(BLURB_FORMAT_LABELS) as BlurbFormat[]).map((fmt) => (
                        <button
                          key={fmt}
                          type="button"
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
                        type="button"
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
                        type="button"
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
                        type="button"
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
                        type="button"
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
                        min={SPINE_FONT_SIZE_MIN_CM}
                        max={SPINE_FONT_SIZE_MAX_CM}
                        step={0.05}
                        value={blurbSpineFontSizeCm}
                        onChange={setBlurbSpineFontSizeCm}
                        formatValue={(v) => `${v.toFixed(2)}cm`}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Recommended for the current simulated page count ({blurbPreviewPageCount} pages): <strong>{recommendedSpineFontSizeCm(previewSpineWidthIn).toFixed(2)}cm</strong>.
                    </p>
                    {blurbSpineText.trim() && !previewSpineTextFits && (
                      <p className="text-xs text-amber-600 mt-1">
                        The spine may be too narrow for this text at the current preview page count - you'll be asked to confirm before generating a Blurb export.
                      </p>
                    )}
                  </div>

                  <div className="rounded-lg border border-purple-200 bg-purple-50/40 p-3">
                    <Slider
                      label="Simulated page count (Blurb preview only)"
                      min={PAGE_COUNT_MIN}
                      max={PAGE_COUNT_MAX}
                      step={PAGE_COUNT_STEP}
                      value={blurbPreviewPageCount}
                      onChange={setBlurbPreviewPageCount}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Estimated spine width at this page count: <strong>{formatSpineWidth(previewSpineWidthIn, blurbMeasurementUnits)}</strong>. Simulation only - a real Blurb export always uses its own actual generated page count.
                    </p>
                  </div>

                  {previewResultMode !== 'blurb' ? (
                    <Button
                      variant="secondary"
                      onClick={() => handleOpenCoverPreview('blurb')}
                      disabled={previewLoadingMode !== null}
                      fullWidth
                    >
                      {previewLoadingMode === 'blurb' ? 'Generating...' : 'Preview (Blurb)'}
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <a
                        href={previewUrl || ''}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-primary-200 bg-primary-50 text-primary-700 text-sm font-medium hover:bg-primary-100 transition-colors"
                      >
                        Open preview PDF
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
                </div>
              )}
            </CollapsibleSection>

            {/* Family Name */}
            <CollapsibleSection title="PDF cover page">
              <div className="space-y-4">
                <details className="rounded-md border border-gray-100 bg-gray-50/70 px-3 py-2">
                  <summary className="text-xs text-gray-600 cursor-pointer select-none">Family name settings</summary>
                  <div className="mt-3 space-y-3">
                    <div>
                      <Input
                        label="Family name"
                        value={familyName}
                        onChange={(e) => setFamilyName(e.target.value.slice(0, 30))}
                        maxLength={30}
                        placeholder="e.g., Dupont family"
                      />
                      <div className="mt-1 flex justify-end">
                        <button
                          onClick={() => setFamilyName(initialFamilyName)}
                          disabled={familyName.trim() === initialFamilyName.trim()}
                          className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-gray-500">
                          Font size
                        </label>
                        <button
                          onClick={() => setFamilyFontCm(initialFamilyFontCm)}
                          disabled={familyFontCm === initialFamilyFontCm}
                          className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                        >
                          Reset
                        </button>
                      </div>
                      <Slider
                        min={1.5}
                        max={5}
                        step={0.05}
                        value={familyFontCm}
                        onChange={setFamilyFontCm}
                        formatValue={(v) => `${v.toFixed(2)}cm`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-gray-500">
                          Character width
                        </label>
                        <button
                          onClick={() => setFamilyScaleX(initialFamilyScaleX)}
                          disabled={familyScaleX === initialFamilyScaleX}
                          className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                        >
                          Reset
                        </button>
                      </div>
                      <Slider
                        min={0.6}
                        max={3}
                        step={0.01}
                        value={familyScaleX}
                        onChange={setFamilyScaleX}
                        formatValue={(v) => `${v.toFixed(2)}x`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-gray-500">
                          Character height
                        </label>
                        <button
                          onClick={() => setFamilyScaleY(initialFamilyScaleY)}
                          disabled={familyScaleY === initialFamilyScaleY}
                          className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                        >
                          Reset
                        </button>
                      </div>
                      <Slider
                        min={0.6}
                        max={3}
                        step={0.01}
                        value={familyScaleY}
                        onChange={setFamilyScaleY}
                        formatValue={(v) => `${v.toFixed(2)}x`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-gray-500">
                          Outline thickness
                        </label>
                        <button
                          onClick={() => setFamilyOutlinePx(initialFamilyOutlinePx)}
                          disabled={familyOutlinePx === initialFamilyOutlinePx}
                          className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                        >
                          Reset
                        </button>
                      </div>
                      <Slider
                        min={0}
                        max={20}
                        step={0.1}
                        value={familyOutlinePx}
                        onChange={setFamilyOutlinePx}
                        formatValue={(v) => `${v.toFixed(1)}px`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-gray-500">
                          Family name horizontal position
                        </label>
                        <button
                          onClick={() => setFamilyXcm(initialFamilyXcm)}
                          disabled={familyXcm === initialFamilyXcm}
                          className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                        >
                          Reset
                        </button>
                      </div>
                      <Slider
                        min={0}
                        max={12}
                        step={0.05}
                        value={familyXcm}
                        onChange={setFamilyXcm}
                        formatValue={(v) => `${v.toFixed(2)}cm`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-gray-500">
                          Letter spacing (relative to title)
                        </label>
                        <button
                          onClick={() => setFamilyLetterSpacingEm(initialFamilyLetterSpacingEm)}
                          disabled={familyLetterSpacingEm === initialFamilyLetterSpacingEm}
                          className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                        >
                          Reset
                        </button>
                      </div>
                      <Slider
                        min={-0.2}
                        max={0.2}
                        step={0.001}
                        value={familyLetterSpacingEm}
                        onChange={setFamilyLetterSpacingEm}
                        formatValue={(v) => `${v.toFixed(3)}em`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-gray-500">
                          Font family
                        </label>
                        <button
                          onClick={() => setFamilyFontFamily(initialFamilyFontFamily)}
                          disabled={familyFontFamily === initialFamilyFontFamily}
                          className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                        >
                          Reset
                        </button>
                      </div>
                      <select
                        value={familyFontFamily}
                        onChange={(e) => setFamilyFontFamily(e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-700 bg-white"
                      >
                        {fontOptions.map((font) => (
                          <option key={font.value} value={font.value}>{font.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-gray-500">
                          Font weight
                        </label>
                        <button
                          onClick={() => setFamilyFontWeight(initialFamilyFontWeight)}
                          disabled={familyFontWeight === initialFamilyFontWeight}
                          className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                        >
                          Reset
                        </button>
                      </div>
                      <select
                        value={familyFontWeight}
                        onChange={(e) => setFamilyFontWeight(Number(e.target.value))}
                        className="w-full px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-700 bg-white"
                      >
                        {fontWeightOptions.map((weight) => (
                          <option key={weight.value} value={weight.value}>{weight.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </details>

                <div>
                  <details className="rounded-md border border-gray-100 bg-gray-50/70 px-3 py-2">
                    <summary className="text-xs text-gray-600 cursor-pointer select-none">Title settings</summary>
                    <div className="mt-3 space-y-3">
                      <div>
                        <Input
                          label="Cover title"
                          value={coverTitle}
                          onChange={(e) => setCoverTitle(e.target.value.slice(0, 30))}
                          maxLength={30}
                          placeholder="e.g., Memory Book"
                        />
                        <div className="mt-1 flex justify-end">
                          <button
                            onClick={() => setCoverTitle(initialCoverTitle)}
                            disabled={coverTitle.trim() === initialCoverTitle.trim()}
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-gray-500">
                            Horizontal position
                          </label>
                          <button
                            onClick={() => setCoverTitleXcm(initialCoverTitleXcm)}
                            disabled={coverTitleXcm === initialCoverTitleXcm}
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                          >
                            Reset
                          </button>
                        </div>
                        <Slider
                          min={0}
                          max={12}
                          step={0.05}
                          value={coverTitleXcm}
                          onChange={setCoverTitleXcm}
                          formatValue={(v) => `${v.toFixed(2)}cm`}
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-gray-500">
                            Font size
                          </label>
                          <button
                            onClick={() => setCoverTitleFontCm(initialCoverTitleFontCm)}
                            disabled={coverTitleFontCm === initialCoverTitleFontCm}
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                          >
                            Reset
                          </button>
                        </div>
                        <Slider
                          min={0.5}
                          max={2}
                          step={0.01}
                          value={coverTitleFontCm}
                          onChange={setCoverTitleFontCm}
                          formatValue={(v) => `${v.toFixed(2)}cm`}
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-gray-500">
                            Character width
                          </label>
                          <button
                            onClick={() => setCoverTitleScaleX(initialCoverTitleScaleX)}
                            disabled={coverTitleScaleX === initialCoverTitleScaleX}
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                          >
                            Reset
                          </button>
                        </div>
                        <Slider
                          min={0.6}
                          max={3}
                          step={0.01}
                          value={coverTitleScaleX}
                          onChange={setCoverTitleScaleX}
                          formatValue={(v) => `${v.toFixed(2)}x`}
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-gray-500">
                            Character height
                          </label>
                          <button
                            onClick={() => setCoverTitleScaleY(initialCoverTitleScaleY)}
                            disabled={coverTitleScaleY === initialCoverTitleScaleY}
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                          >
                            Reset
                          </button>
                        </div>
                        <Slider
                          min={0.6}
                          max={3}
                          step={0.01}
                          value={coverTitleScaleY}
                          onChange={setCoverTitleScaleY}
                          formatValue={(v) => `${v.toFixed(2)}x`}
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-gray-500">
                            Letter spacing
                          </label>
                          <button
                            onClick={() => setCoverTitleLetterSpacingEm(initialCoverTitleLetterSpacingEm)}
                            disabled={coverTitleLetterSpacingEm === initialCoverTitleLetterSpacingEm}
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                          >
                            Reset
                          </button>
                        </div>
                        <Slider
                          min={-0.2}
                          max={0.2}
                          step={0.001}
                          value={coverTitleLetterSpacingEm}
                          onChange={setCoverTitleLetterSpacingEm}
                          formatValue={(v) => `${v.toFixed(3)}em`}
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-gray-500">
                            Font family
                          </label>
                          <button
                            onClick={() => setCoverTitleFontFamily(initialCoverTitleFontFamily)}
                            disabled={coverTitleFontFamily === initialCoverTitleFontFamily}
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                          >
                            Reset
                          </button>
                        </div>
                        <select
                          value={coverTitleFontFamily}
                          onChange={(e) => setCoverTitleFontFamily(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-700 bg-white"
                        >
                          {fontOptions.map((font) => (
                            <option key={font.value} value={font.value}>{font.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-gray-500">
                            Font weight
                          </label>
                          <button
                            onClick={() => setCoverTitleFontWeight(initialCoverTitleFontWeight)}
                            disabled={coverTitleFontWeight === initialCoverTitleFontWeight}
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                          >
                            Reset
                          </button>
                        </div>
                        <select
                          value={coverTitleFontWeight}
                          onChange={(e) => setCoverTitleFontWeight(Number(e.target.value))}
                          className="w-full px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-700 bg-white"
                        >
                          {fontWeightOptions.map((weight) => (
                            <option key={weight.value} value={weight.value}>{weight.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </details>
                </div>

                <div>
                  <details className="rounded-md border border-gray-100 bg-gray-50/70 px-3 py-2">
                    <summary className="text-xs text-gray-600 cursor-pointer select-none">Subtitle settings</summary>
                    <div className="mt-3 space-y-3">
                      <div>
                        <Input
                          label="Cover subtitle"
                          value={coverSubtitle}
                          onChange={(e) => setCoverSubtitle(e.target.value.slice(0, 30))}
                          maxLength={30}
                          placeholder="e.g., 2024 — 2025"
                        />
                        <div className="mt-1 flex justify-end">
                          <button
                            onClick={() => setCoverSubtitle(initialCoverSubtitle)}
                            disabled={coverSubtitle.trim() === initialCoverSubtitle.trim()}
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-gray-500">
                            Horizontal position
                          </label>
                          <button
                            onClick={() => setCoverSubtitleXcm(initialCoverSubtitleXcm)}
                            disabled={coverSubtitleXcm === initialCoverSubtitleXcm}
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                          >
                            Reset
                          </button>
                        </div>
                        <Slider
                          min={0}
                          max={12}
                          step={0.05}
                          value={coverSubtitleXcm}
                          onChange={setCoverSubtitleXcm}
                          formatValue={(v) => `${v.toFixed(2)}cm`}
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-gray-500">
                            Font size
                          </label>
                          <button
                            onClick={() => setCoverSubtitleFontCm(initialCoverSubtitleFontCm)}
                            disabled={coverSubtitleFontCm === initialCoverSubtitleFontCm}
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                          >
                            Reset
                          </button>
                        </div>
                        <Slider
                          min={0.4}
                          max={1.6}
                          step={0.01}
                          value={coverSubtitleFontCm}
                          onChange={setCoverSubtitleFontCm}
                          formatValue={(v) => `${v.toFixed(2)}cm`}
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-gray-500">
                            Character width
                          </label>
                          <button
                            onClick={() => setCoverSubtitleScaleX(initialCoverSubtitleScaleX)}
                            disabled={coverSubtitleScaleX === initialCoverSubtitleScaleX}
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                          >
                            Reset
                          </button>
                        </div>
                        <Slider
                          min={0.6}
                          max={3}
                          step={0.01}
                          value={coverSubtitleScaleX}
                          onChange={setCoverSubtitleScaleX}
                          formatValue={(v) => `${v.toFixed(2)}x`}
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-gray-500">
                            Character height
                          </label>
                          <button
                            onClick={() => setCoverSubtitleScaleY(initialCoverSubtitleScaleY)}
                            disabled={coverSubtitleScaleY === initialCoverSubtitleScaleY}
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                          >
                            Reset
                          </button>
                        </div>
                        <Slider
                          min={0.6}
                          max={3}
                          step={0.01}
                          value={coverSubtitleScaleY}
                          onChange={setCoverSubtitleScaleY}
                          formatValue={(v) => `${v.toFixed(2)}x`}
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-gray-500">
                            Letter spacing
                          </label>
                          <button
                            onClick={() => setCoverSubtitleLetterSpacingEm(initialCoverSubtitleLetterSpacingEm)}
                            disabled={coverSubtitleLetterSpacingEm === initialCoverSubtitleLetterSpacingEm}
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                          >
                            Reset
                          </button>
                        </div>
                        <Slider
                          min={-0.2}
                          max={0.2}
                          step={0.001}
                          value={coverSubtitleLetterSpacingEm}
                          onChange={setCoverSubtitleLetterSpacingEm}
                          formatValue={(v) => `${v.toFixed(3)}em`}
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-gray-500">
                            Font family
                          </label>
                          <button
                            onClick={() => setCoverSubtitleFontFamily(initialCoverSubtitleFontFamily)}
                            disabled={coverSubtitleFontFamily === initialCoverSubtitleFontFamily}
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                          >
                            Reset
                          </button>
                        </div>
                        <select
                          value={coverSubtitleFontFamily}
                          onChange={(e) => setCoverSubtitleFontFamily(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-700 bg-white"
                        >
                          {fontOptions.map((font) => (
                            <option key={font.value} value={font.value}>{font.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-gray-500">
                            Font weight
                          </label>
                          <button
                            onClick={() => setCoverSubtitleFontWeight(initialCoverSubtitleFontWeight)}
                            disabled={coverSubtitleFontWeight === initialCoverSubtitleFontWeight}
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                          >
                            Reset
                          </button>
                        </div>
                        <select
                          value={coverSubtitleFontWeight}
                          onChange={(e) => setCoverSubtitleFontWeight(Number(e.target.value))}
                          className="w-full px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-700 bg-white"
                        >
                          {fontWeightOptions.map((weight) => (
                            <option key={weight.value} value={weight.value}>{weight.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </details>
                </div>
              </div>
              <div className="mt-4">
                {previewResultMode !== 'normal' ? (
                  <Button
                    variant="secondary"
                    onClick={() => handleOpenCoverPreview('normal')}
                    disabled={previewLoadingMode !== null}
                    fullWidth
                  >
                    {previewLoadingMode === 'normal' ? 'Generating...' : 'Preview (normal)'}
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <a
                      href={previewUrl || ''}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-primary-200 bg-primary-50 text-primary-700 text-sm font-medium hover:bg-primary-100 transition-colors"
                    >
                      Open preview PDF
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
              </div>
            </CollapsibleSection>

            {/* Logs cleanup */}
            <CollapsibleSection title="PDF logs">
              {logsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Spinner size="md" />
                </div>
              ) : logsMin === null || logsMax === null ? (
                <p className="text-sm text-gray-500">No logs available.</p>
              ) : (
                <>
                  <div className="text-xs text-gray-500 mb-3">
                    {formatDateFr(logsFrom)} → {formatDateFr(logsTo)}
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-500">From</label>
                      <Slider
                        min={logsMin}
                        max={logsMax}
                        step={86400000}
                        value={logsFrom ?? logsMin}
                        onChange={(value) => {
                          setLogsFrom(value)
                          if (logsTo !== null && value > logsTo) setLogsTo(value)
                        }}
                        formatValue={formatDateFr}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">To</label>
                      <Slider
                        min={logsMin}
                        max={logsMax}
                        step={86400000}
                        value={logsTo ?? logsMax}
                        onChange={(value) => {
                          setLogsTo(value)
                          if (logsFrom !== null && value < logsFrom) setLogsFrom(value)
                        }}
                        formatValue={formatDateFr}
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex justify-center">
                    <Button
                      variant="secondary"
                      onClick={handleClearLogs}
                      disabled={isClearingLogs || logsFrom === null || logsTo === null}
                      className="w-full sm:w-auto"
                    >
                      Clear logs
                    </Button>
                  </div>
                </>
              )}
            </CollapsibleSection>

            <CollapsibleSection title="Famileo logs">
              {famileoLogsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Spinner size="md" />
                </div>
              ) : famileoLogsMin === null || famileoLogsMax === null ? (
                <p className="text-sm text-gray-500">No logs available.</p>
              ) : (
                <>
                  <div className="text-xs text-gray-500 mb-3">
                    {formatDateFr(famileoLogsFrom)} → {formatDateFr(famileoLogsTo)}
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-500">From</label>
                      <Slider
                        min={famileoLogsMin}
                        max={famileoLogsMax}
                        step={86400000}
                        value={famileoLogsFrom ?? famileoLogsMin}
                        onChange={(value) => {
                          setFamileoLogsFrom(value)
                          if (famileoLogsTo !== null && value > famileoLogsTo) setFamileoLogsTo(value)
                        }}
                        formatValue={formatDateFr}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">To</label>
                      <Slider
                        min={famileoLogsMin}
                        max={famileoLogsMax}
                        step={86400000}
                        value={famileoLogsTo ?? famileoLogsMax}
                        onChange={(value) => {
                          setFamileoLogsTo(value)
                          if (famileoLogsFrom !== null && value < famileoLogsFrom) setFamileoLogsFrom(value)
                        }}
                        formatValue={formatDateFr}
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex justify-center">
                    <Button
                      variant="secondary"
                      onClick={handleClearFamileoLogs}
                      disabled={isClearingFamileoLogs || famileoLogsFrom === null || famileoLogsTo === null}
                      className="w-full sm:w-auto"
                    >
                      Clear logs
                    </Button>
                  </div>
                </>
              )}
            </CollapsibleSection>

            {/* Maintenance */}
            <CollapsibleSection title="Maintenance">
              <div className="flex flex-col items-start gap-4">
                <div className="flex flex-col items-start gap-2 w-full">
                  <p className="text-xs text-gray-500">
                    Rebuilds Famileo fingerprints for existing articles to improve duplicate detection.
                  </p>
                  <Button
                    variant="secondary"
                    onClick={handleBackfillFingerprints}
                    disabled={isBackfilling}
                    className="w-full sm:w-auto"
                  >
                    Backfill Famileo fingerprints
                  </Button>
                </div>
                <div className="flex flex-col items-start gap-2 w-full">
                  <p className="text-xs text-gray-500">
                    Refresh Google Drive merge token stored in backend Script Properties.
                  </p>
                  <div className="text-xs text-gray-500">
                    {mergeTokenStatus?.configured
                      ? `Configured${mergeTokenStatus.expiry ? `, expires: ${new Date(mergeTokenStatus.expiry).toLocaleString('fr-FR')}` : ''}`
                      : 'Not configured (set Script Property: GDRIVE_TOKEN_JSON)'}
                  </div>
                  <Button
                    variant="secondary"
                    onClick={handleRefreshMergeToken}
                    disabled={isRefreshingMergeToken || !mergeTokenStatus?.configured}
                    className="w-full sm:w-auto"
                  >
                    {isRefreshingMergeToken ? 'Refreshing merge token...' : 'Refresh merge token'}
                  </Button>
                </div>
              </div>
            </CollapsibleSection>
            {backendUrl && (
              <CollapsibleSection title="Links">
                <div className="flex flex-col gap-2 text-sm">
                  <a
                    href={backendUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary-600 hover:text-primary-700"
                  >
                    Open Backend URL
                  </a>
                </div>
              </CollapsibleSection>
            )}
          </>
        )}
      </div>

      {/* Actions */}
      <div className="bg-white border-t border-gray-200 p-4 sticky bottom-16">
        <div className="max-w-md mx-auto w-full flex justify-center">
          <Button
            onClick={handleSave}
            disabled={isSaving || isLoading || !isDirty}
            className="w-full sm:w-auto"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {isSaving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl px-6 py-5 flex flex-col items-center">
            <Spinner size="md" />
            <p className="mt-3 text-sm text-gray-700">Saving...</p>
          </div>
        </div>
      )}

      {isClearingLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl px-6 py-5 w-72">
            <div className="flex items-center justify-center">
              <Spinner size="md" />
            </div>
            <p className="mt-3 text-sm text-gray-700 text-center">Clearing logs...</p>
            <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-600 transition-all"
                style={{ width: `${clearProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {isClearingFamileoLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl px-6 py-5 w-72">
            <div className="flex items-center justify-center">
              <Spinner size="md" />
            </div>
            <p className="mt-3 text-sm text-gray-700 text-center">Clearing Famileo logs...</p>
            <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-600 transition-all"
                style={{ width: `${famileoClearProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
