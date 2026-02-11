import { useState, useEffect } from 'react'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { Spinner } from '../../ui/Spinner'
import { useUiStore } from '../../state/uiStore'
import { AppHeader } from '../../ui/AppHeader'
import { configApi } from '../../api/config'
import { logsApi } from '../../api/logs'
import { usersApi, DeclaredUser } from '../../api/users'
import { articlesApi } from '../../api/articles'
import { useImageLoader } from '../../hooks/useImageLoader'
import { pdfApi } from '../../api/pdf'

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
  const [sheetUrl, setSheetUrl] = useState('')

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
  const [previewLoading, setPreviewLoading] = useState(false)
  const [isCleaningProps, setIsCleaningProps] = useState(false)
  const [isBackfilling, setIsBackfilling] = useState(false)
  const [usersLoading, setUsersLoading] = useState(false)
  const [users, setUsers] = useState<DeclaredUser[]>([])
  const isDirty = familyName.trim() !== initialFamilyName.trim()
    || coverTitle.trim() !== initialCoverTitle.trim()
    || coverSubtitle.trim() !== initialCoverSubtitle.trim()
    || familyLetterSpacingEm !== initialFamilyLetterSpacingEm
    || familyXcm !== initialFamilyXcm
    || familyFontFamily !== initialFamilyFontFamily
    || familyFontWeight !== initialFamilyFontWeight
    || familyFontCm !== initialFamilyFontCm
    || familyScaleX !== initialFamilyScaleX
    || familyScaleY !== initialFamilyScaleY
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

  useEffect(() => {
    loadConfig()
    loadLogsRange()
    loadFamileoLogsRange()
    loadUsers()
    cleanupStaleCoverPreview()
    loadLinks()
  }, [])

  async function loadLinks() {
    try {
      const links = await configApi.links()
      setSheetUrl(links.spreadsheet_url || '')
    } catch (error) {
      console.warn('Failed to load config links', error)
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

  const handleOpenCoverPreview = async () => {
    setPreviewLoading(true)
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
        },
      })
      setPreviewFileId(response.file_id)
      localStorage.setItem('cover_preview_file_id', response.file_id)
      const content = await pdfApi.previewCoverContent(response.file_id)
      const byteCharacters = atob(content.base64)
      const bytes = new Uint8Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        bytes[i] = byteCharacters.charCodeAt(i)
      }
      const blob = new Blob([bytes.buffer], { type: content.mime_type || 'application/pdf' })
      const url = URL.createObjectURL(blob)
      setPreviewUrl(url)
    } catch (error) {
      showToast('Preview failed', 'error')
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

  const handleCleanupProperties = async () => {
    setIsCleaningProps(true)
    try {
      const result = await logsApi.cleanupPdfProperties()
      showToast(`Properties cleaned: ${result.deleted}, queue removed: ${result.queueRemoved}`, 'success')
    } catch (error) {
      showToast('Failed to cleanup properties', 'error')
    } finally {
      setIsCleaningProps(false)
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
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Declared users</h3>
                <button
                  onClick={loadUsers}
                  disabled={usersLoading}
                  className="text-xs text-primary-600 hover:text-primary-700"
                >
                  Refresh
                </button>
              </div>
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
            </div>

            {/* Family Name */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">PDF cover page</h3>
              <div className="mt-3 space-y-4">
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
                          Font size ({familyFontCm.toFixed(2)}cm)
                        </label>
                        <button
                          onClick={() => setFamilyFontCm(initialFamilyFontCm)}
                          disabled={familyFontCm === initialFamilyFontCm}
                          className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                        >
                          Reset
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={1.5}
                          max={5}
                          step={0.05}
                          value={familyFontCm}
                          onChange={(e) => setFamilyFontCm(Number(e.target.value))}
                          className="w-full"
                        />
                        <input
                          type="number"
                          min={1.5}
                          max={5}
                          step={0.05}
                          value={Number.isFinite(familyFontCm) ? familyFontCm : 3.5}
                          onChange={(e) => setFamilyFontCm(Number(e.target.value))}
                          className="w-24 px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-700"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-gray-500">
                          Character width ({familyScaleX.toFixed(2)}x)
                        </label>
                        <button
                          onClick={() => setFamilyScaleX(initialFamilyScaleX)}
                          disabled={familyScaleX === initialFamilyScaleX}
                          className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                        >
                          Reset
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0.6}
                          max={3}
                          step={0.01}
                          value={familyScaleX}
                          onChange={(e) => setFamilyScaleX(Number(e.target.value))}
                          className="w-full"
                        />
                        <input
                          type="number"
                          min={0.6}
                          max={3}
                          step={0.01}
                          value={Number.isFinite(familyScaleX) ? familyScaleX : 1}
                          onChange={(e) => setFamilyScaleX(Number(e.target.value))}
                          className="w-24 px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-700"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-gray-500">
                          Character height ({familyScaleY.toFixed(2)}x)
                        </label>
                        <button
                          onClick={() => setFamilyScaleY(initialFamilyScaleY)}
                          disabled={familyScaleY === initialFamilyScaleY}
                          className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                        >
                          Reset
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0.6}
                          max={3}
                          step={0.01}
                          value={familyScaleY}
                          onChange={(e) => setFamilyScaleY(Number(e.target.value))}
                          className="w-full"
                        />
                        <input
                          type="number"
                          min={0.6}
                          max={3}
                          step={0.01}
                          value={Number.isFinite(familyScaleY) ? familyScaleY : 1}
                          onChange={(e) => setFamilyScaleY(Number(e.target.value))}
                          className="w-24 px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-700"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-gray-500">
                          Family name horizontal position ({familyXcm.toFixed(2)}cm)
                        </label>
                        <button
                          onClick={() => setFamilyXcm(initialFamilyXcm)}
                          disabled={familyXcm === initialFamilyXcm}
                          className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                        >
                          Reset
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={12}
                          step={0.05}
                          value={familyXcm}
                          onChange={(e) => setFamilyXcm(Number(e.target.value))}
                          className="w-full"
                        />
                        <input
                          type="number"
                          min={0}
                          max={12}
                          step={0.01}
                          value={Number.isFinite(familyXcm) ? familyXcm : 0}
                          onChange={(e) => setFamilyXcm(Number(e.target.value))}
                          className="w-24 px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-700"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-gray-500">
                          Letter spacing (relative to title) ({familyLetterSpacingEm.toFixed(3)}em)
                        </label>
                        <button
                          onClick={() => setFamilyLetterSpacingEm(initialFamilyLetterSpacingEm)}
                          disabled={familyLetterSpacingEm === initialFamilyLetterSpacingEm}
                          className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                        >
                          Reset
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={-0.2}
                          max={0.2}
                          step={0.001}
                          value={familyLetterSpacingEm}
                          onChange={(e) => setFamilyLetterSpacingEm(Number(e.target.value))}
                          className="w-full"
                        />
                        <input
                          type="number"
                          min={-0.2}
                          max={0.2}
                          step={0.001}
                          value={Number.isFinite(familyLetterSpacingEm) ? familyLetterSpacingEm : 0}
                          onChange={(e) => setFamilyLetterSpacingEm(Number(e.target.value))}
                          className="w-24 px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-700"
                        />
                      </div>
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
                            Horizontal position ({coverTitleXcm.toFixed(2)}cm)
                          </label>
                          <button
                            onClick={() => setCoverTitleXcm(initialCoverTitleXcm)}
                            disabled={coverTitleXcm === initialCoverTitleXcm}
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                          >
                            Reset
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={12}
                            step={0.05}
                            value={coverTitleXcm}
                            onChange={(e) => setCoverTitleXcm(Number(e.target.value))}
                            className="w-full"
                          />
                          <input
                            type="number"
                            min={0}
                            max={12}
                            step={0.01}
                            value={Number.isFinite(coverTitleXcm) ? coverTitleXcm : 0}
                            onChange={(e) => setCoverTitleXcm(Number(e.target.value))}
                            className="w-24 px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-700"
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-gray-500">
                            Font size ({coverTitleFontCm.toFixed(2)}cm)
                          </label>
                          <button
                            onClick={() => setCoverTitleFontCm(initialCoverTitleFontCm)}
                            disabled={coverTitleFontCm === initialCoverTitleFontCm}
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                          >
                            Reset
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0.5}
                            max={2}
                            step={0.01}
                            value={coverTitleFontCm}
                            onChange={(e) => setCoverTitleFontCm(Number(e.target.value))}
                            className="w-full"
                          />
                          <input
                            type="number"
                            min={0.5}
                            max={2}
                            step={0.01}
                            value={Number.isFinite(coverTitleFontCm) ? coverTitleFontCm : 0.99}
                            onChange={(e) => setCoverTitleFontCm(Number(e.target.value))}
                            className="w-24 px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-700"
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-gray-500">
                            Character width ({coverTitleScaleX.toFixed(2)}x)
                          </label>
                          <button
                            onClick={() => setCoverTitleScaleX(initialCoverTitleScaleX)}
                            disabled={coverTitleScaleX === initialCoverTitleScaleX}
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                          >
                            Reset
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0.6}
                            max={3}
                            step={0.01}
                            value={coverTitleScaleX}
                            onChange={(e) => setCoverTitleScaleX(Number(e.target.value))}
                            className="w-full"
                          />
                          <input
                            type="number"
                            min={0.6}
                            max={3}
                            step={0.01}
                            value={Number.isFinite(coverTitleScaleX) ? coverTitleScaleX : 1}
                            onChange={(e) => setCoverTitleScaleX(Number(e.target.value))}
                            className="w-24 px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-700"
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-gray-500">
                            Character height ({coverTitleScaleY.toFixed(2)}x)
                          </label>
                          <button
                            onClick={() => setCoverTitleScaleY(initialCoverTitleScaleY)}
                            disabled={coverTitleScaleY === initialCoverTitleScaleY}
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                          >
                            Reset
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0.6}
                            max={3}
                            step={0.01}
                            value={coverTitleScaleY}
                            onChange={(e) => setCoverTitleScaleY(Number(e.target.value))}
                            className="w-full"
                          />
                          <input
                            type="number"
                            min={0.6}
                            max={3}
                            step={0.01}
                            value={Number.isFinite(coverTitleScaleY) ? coverTitleScaleY : 1}
                            onChange={(e) => setCoverTitleScaleY(Number(e.target.value))}
                            className="w-24 px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-700"
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-gray-500">
                            Letter spacing ({coverTitleLetterSpacingEm.toFixed(3)}em)
                          </label>
                          <button
                            onClick={() => setCoverTitleLetterSpacingEm(initialCoverTitleLetterSpacingEm)}
                            disabled={coverTitleLetterSpacingEm === initialCoverTitleLetterSpacingEm}
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                          >
                            Reset
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={-0.2}
                            max={0.2}
                            step={0.001}
                            value={coverTitleLetterSpacingEm}
                            onChange={(e) => setCoverTitleLetterSpacingEm(Number(e.target.value))}
                            className="w-full"
                          />
                          <input
                            type="number"
                            min={-0.2}
                            max={0.2}
                            step={0.001}
                            value={Number.isFinite(coverTitleLetterSpacingEm) ? coverTitleLetterSpacingEm : 0}
                            onChange={(e) => setCoverTitleLetterSpacingEm(Number(e.target.value))}
                            className="w-24 px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-700"
                          />
                        </div>
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
                            Horizontal position ({coverSubtitleXcm.toFixed(2)}cm)
                          </label>
                          <button
                            onClick={() => setCoverSubtitleXcm(initialCoverSubtitleXcm)}
                            disabled={coverSubtitleXcm === initialCoverSubtitleXcm}
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                          >
                            Reset
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={12}
                            step={0.05}
                            value={coverSubtitleXcm}
                            onChange={(e) => setCoverSubtitleXcm(Number(e.target.value))}
                            className="w-full"
                          />
                          <input
                            type="number"
                            min={0}
                            max={12}
                            step={0.01}
                            value={Number.isFinite(coverSubtitleXcm) ? coverSubtitleXcm : 0}
                            onChange={(e) => setCoverSubtitleXcm(Number(e.target.value))}
                            className="w-24 px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-700"
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-gray-500">
                            Font size ({coverSubtitleFontCm.toFixed(2)}cm)
                          </label>
                          <button
                            onClick={() => setCoverSubtitleFontCm(initialCoverSubtitleFontCm)}
                            disabled={coverSubtitleFontCm === initialCoverSubtitleFontCm}
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                          >
                            Reset
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0.4}
                            max={1.6}
                            step={0.01}
                            value={coverSubtitleFontCm}
                            onChange={(e) => setCoverSubtitleFontCm(Number(e.target.value))}
                            className="w-full"
                          />
                          <input
                            type="number"
                            min={0.4}
                            max={1.6}
                            step={0.01}
                            value={Number.isFinite(coverSubtitleFontCm) ? coverSubtitleFontCm : 0.85}
                            onChange={(e) => setCoverSubtitleFontCm(Number(e.target.value))}
                            className="w-24 px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-700"
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-gray-500">
                            Character width ({coverSubtitleScaleX.toFixed(2)}x)
                          </label>
                          <button
                            onClick={() => setCoverSubtitleScaleX(initialCoverSubtitleScaleX)}
                            disabled={coverSubtitleScaleX === initialCoverSubtitleScaleX}
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                          >
                            Reset
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0.6}
                            max={3}
                            step={0.01}
                            value={coverSubtitleScaleX}
                            onChange={(e) => setCoverSubtitleScaleX(Number(e.target.value))}
                            className="w-full"
                          />
                          <input
                            type="number"
                            min={0.6}
                            max={3}
                            step={0.01}
                            value={Number.isFinite(coverSubtitleScaleX) ? coverSubtitleScaleX : 1}
                            onChange={(e) => setCoverSubtitleScaleX(Number(e.target.value))}
                            className="w-24 px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-700"
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-gray-500">
                            Character height ({coverSubtitleScaleY.toFixed(2)}x)
                          </label>
                          <button
                            onClick={() => setCoverSubtitleScaleY(initialCoverSubtitleScaleY)}
                            disabled={coverSubtitleScaleY === initialCoverSubtitleScaleY}
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                          >
                            Reset
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0.6}
                            max={3}
                            step={0.01}
                            value={coverSubtitleScaleY}
                            onChange={(e) => setCoverSubtitleScaleY(Number(e.target.value))}
                            className="w-full"
                          />
                          <input
                            type="number"
                            min={0.6}
                            max={3}
                            step={0.01}
                            value={Number.isFinite(coverSubtitleScaleY) ? coverSubtitleScaleY : 1}
                            onChange={(e) => setCoverSubtitleScaleY(Number(e.target.value))}
                            className="w-24 px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-700"
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-gray-500">
                            Letter spacing ({coverSubtitleLetterSpacingEm.toFixed(3)}em)
                          </label>
                          <button
                            onClick={() => setCoverSubtitleLetterSpacingEm(initialCoverSubtitleLetterSpacingEm)}
                            disabled={coverSubtitleLetterSpacingEm === initialCoverSubtitleLetterSpacingEm}
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                          >
                            Reset
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={-0.2}
                            max={0.2}
                            step={0.001}
                            value={coverSubtitleLetterSpacingEm}
                            onChange={(e) => setCoverSubtitleLetterSpacingEm(Number(e.target.value))}
                            className="w-full"
                          />
                          <input
                            type="number"
                            min={-0.2}
                            max={0.2}
                            step={0.001}
                            value={Number.isFinite(coverSubtitleLetterSpacingEm) ? coverSubtitleLetterSpacingEm : 0}
                            onChange={(e) => setCoverSubtitleLetterSpacingEm(Number(e.target.value))}
                            className="w-24 px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-700"
                          />
                        </div>
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
                {!previewUrl ? (
                  <Button
                    variant="secondary"
                    onClick={handleOpenCoverPreview}
                    disabled={previewLoading}
                    fullWidth
                  >
                    {previewLoading ? 'Generating preview...' : 'Preview PDF'}
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <a
                      href={previewUrl}
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
            </div>

            {/* Logs cleanup */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">PDF logs</h3>
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
                      <input
                        type="range"
                        min={logsMin}
                        max={logsMax}
                        value={logsFrom ?? logsMin}
                        onChange={(e) => {
                          const value = Number(e.target.value)
                          setLogsFrom(value)
                          if (logsTo !== null && value > logsTo) setLogsTo(value)
                        }}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">To</label>
                      <input
                        type="range"
                        min={logsMin}
                        max={logsMax}
                        value={logsTo ?? logsMax}
                        onChange={(e) => {
                          const value = Number(e.target.value)
                          setLogsTo(value)
                          if (logsFrom !== null && value < logsFrom) setLogsFrom(value)
                        }}
                        className="w-full"
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
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Famileo logs</h3>
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
                      <input
                        type="range"
                        min={famileoLogsMin}
                        max={famileoLogsMax}
                        value={famileoLogsFrom ?? famileoLogsMin}
                        onChange={(e) => {
                          const value = Number(e.target.value)
                          setFamileoLogsFrom(value)
                          if (famileoLogsTo !== null && value > famileoLogsTo) setFamileoLogsTo(value)
                        }}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">To</label>
                      <input
                        type="range"
                        min={famileoLogsMin}
                        max={famileoLogsMax}
                        value={famileoLogsTo ?? famileoLogsMax}
                        onChange={(e) => {
                          const value = Number(e.target.value)
                          setFamileoLogsTo(value)
                          if (famileoLogsFrom !== null && value < famileoLogsFrom) setFamileoLogsFrom(value)
                        }}
                        className="w-full"
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
            </div>

            {/* Cleanup properties */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Maintenance</h3>
              <p className="text-xs text-gray-500 mb-3">
                Remove orphan PDF properties when jobs were deleted manually.
              </p>
              <div className="flex flex-col items-start gap-4">
                <Button
                  variant="secondary"
                  onClick={handleCleanupProperties}
                  disabled={isCleaningProps}
                  className="w-full sm:w-auto"
                >
                  Clean PDF properties
                </Button>
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
              </div>
            </div>
            {(backendUrl || sheetUrl) && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Links</h3>
                <div className="flex flex-col gap-2 text-sm">
                  {backendUrl && (
                    <a
                      href={backendUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary-600 hover:text-primary-700"
                    >
                      Open Backend URL
                    </a>
                  )}
                  {sheetUrl && (
                    <a
                      href={sheetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary-600 hover:text-primary-700"
                    >
                      Open Spreadsheet
                    </a>
                  )}
                </div>
              </div>
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

      {isCleaningProps && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl px-6 py-5 flex flex-col items-center">
            <Spinner size="md" />
            <p className="mt-3 text-sm text-gray-700">Cleaning properties...</p>
          </div>
        </div>
      )}
    </div>
  )
}
