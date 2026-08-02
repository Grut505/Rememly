import { useEffect, useRef, useState } from 'react'
import { Modal } from './Modal'
import { DatePicker } from './DatePicker'
import { pdfApi } from '../api/pdf'
import { configApi } from '../api/config'
import { useUiStore } from '../state/uiStore'

interface PdfArticlePreviewModalProps {
  isOpen: boolean
  onClose: () => void
  articleId?: string
  articleDate: string
  articleTexte: string
  photoFile: File | null
  articleImageFileId?: string
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] || '')
    }
    reader.onerror = reject
  })
}

export function PdfArticlePreviewModal({
  isOpen,
  onClose,
  articleId,
  articleDate,
  articleTexte,
  photoFile,
  articleImageFileId,
}: PdfArticlePreviewModalProps) {
  const { showToast } = useUiStore()
  const [startDate, setStartDate] = useState('')
  const [defaultStartDate, setDefaultStartDate] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [previewFileId, setPreviewFileId] = useState<string | null>(null)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [targetPage, setTargetPage] = useState<number | null>(null)
  const [frameScale, setFrameScale] = useState(1)
  const [frameSize, setFrameSize] = useState({ width: 794, height: 1123 })
  const frameWrapperRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!isOpen) return
    configApi.get('pdf_preview_start_date')
      .then((result) => {
        const value = result.value || ''
        setDefaultStartDate(value)
        setStartDate(value)
      })
      .catch(() => {
        setDefaultStartDate('')
        setStartDate('')
      })
  }, [isOpen])

  const cleanupPreview = async () => {
    const fileId = previewFileId
    setPreviewFileId(null)
    setPreviewHtml(null)
    setTargetPage(null)
    setFrameScale(1)
    if (fileId) {
      try {
        await pdfApi.deleteArticlePreview(fileId)
      } catch {
        // ignore
      }
    }
  }

  useEffect(() => {
    if (!isOpen) {
      cleanupPreview()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const handleGenerate = async () => {
    if (!startDate) {
      showToast('Set a start date first', 'error')
      return
    }
    await cleanupPreview()
    setIsGenerating(true)
    try {
      const imagePayload = photoFile
        ? { base64: await fileToBase64(photoFile), mimeType: photoFile.type || 'image/jpeg' }
        : undefined

      const response = await pdfApi.previewArticle({
        start_date: startDate,
        article: {
          id: articleId,
          date: articleDate,
          texte: articleTexte,
          image_file_id: imagePayload ? undefined : articleImageFileId,
          image: imagePayload,
        },
      })
      setPreviewFileId(response.file_id)

      // This preview only builds one HTML page (no Chromium/PDF step, see
      // render_article_preview.py), so a cold GitHub Actions runner
      // (checkout + Python setup + pip install) is the only real wait -
      // well under a minute in practice, but left generous for a slow runner.
      const deadline = Date.now() + 3 * 60 * 1000
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

      const content = await pdfApi.previewArticleContent(response.file_id)
      // base64 was produced from UTF-8 bytes (render_article_preview.py), so
      // atob() alone would mangle any accented character - decode through
      // the raw bytes instead of treating atob's Latin1 output as the string.
      const byteCharacters = atob(content.base64)
      const bytes = new Uint8Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        bytes[i] = byteCharacters.charCodeAt(i)
      }
      const html = new TextDecoder('utf-8').decode(bytes)
      setPreviewHtml(html)
      setTargetPage(content.meta?.target_page || null)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Preview failed', 'error')
      setPreviewFileId(null)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleClose = () => {
    onClose()
  }

  const handleFrameLoad = () => {
    const iframe = frameRef.current
    const wrapper = frameWrapperRef.current
    const pageEl = iframe?.contentDocument?.querySelector('.articles-page') as HTMLElement | null
    if (!iframe || !wrapper || !pageEl) return
    const naturalWidth = pageEl.offsetWidth
    const naturalHeight = pageEl.offsetHeight
    if (!naturalWidth || !naturalHeight) return
    setFrameSize({ width: naturalWidth, height: naturalHeight })
    const containerWidth = wrapper.clientWidth
    setFrameScale(containerWidth > 0 ? Math.min(1, containerWidth / naturalWidth) : 1)
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Preview in PDF" align="center">
      <div className="px-4 py-4 space-y-4 text-sm text-gray-700">
        <p className="text-xs text-gray-500">
          Simulates generating a PDF with your current settings from the start date below through this article's own date, and shows the exact page/position it would land on.
        </p>

        <DatePicker
          label="Simulated start date"
          value={startDate}
          onChange={setStartDate}
        />
        {defaultStartDate && startDate !== defaultStartDate && (
          <button
            type="button"
            onClick={() => setStartDate(defaultStartDate)}
            className="text-xs text-primary-600 hover:text-primary-700"
          >
            Reset to Settings default ({defaultStartDate})
          </button>
        )}

        {!previewHtml && (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !startDate}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-60"
          >
            {isGenerating ? 'Generating...' : 'Generate preview'}
          </button>
        )}

        {previewHtml && (
          <div className="space-y-2">
            {targetPage && (
              <p className="text-sm text-gray-700">
                This article would land on <span className="font-semibold">page {targetPage}</span>.
              </p>
            )}
            <div
              ref={frameWrapperRef}
              className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50"
              style={{ height: frameSize.height * frameScale }}
            >
              <iframe
                ref={frameRef}
                srcDoc={previewHtml}
                onLoad={handleFrameLoad}
                title="Article page preview"
                style={{
                  width: frameSize.width,
                  height: frameSize.height,
                  border: 'none',
                  transform: `scale(${frameScale})`,
                  transformOrigin: 'top left',
                }}
              />
            </div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full text-xs text-gray-500 hover:text-gray-700"
            >
              Regenerate
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
