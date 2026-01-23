import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppHeader } from '../../ui/AppHeader'
import { Button } from '../../ui/Button'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { articlesApi } from '../../api/articles'
import { pdfApi, PdfListItem } from '../../api/pdf'
import { Article } from '../../api/types'
import { getMonthYear } from '../../utils/date'

interface MonthCount {
  key: string
  label: string
  count: number
}

export function PdfExport() {
  const navigate = useNavigate()

  // Tab state
  const [activeTab, setActiveTab] = useState<'generate' | 'history'>('generate')

  // Generate tab state
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [monthCounts, setMonthCounts] = useState<MonthCount[]>([])
  const [totalArticles, setTotalArticles] = useState(0)

  // PDF generation state
  const [generating, setGenerating] = useState(false)
  const [pdfProgress, setPdfProgress] = useState(0)
  const [pdfProgressMessage, setPdfProgressMessage] = useState('')
  const [pdfStatus, setPdfStatus] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  // PDF options
  const [mosaicLayout, setMosaicLayout] = useState<'full' | 'centered'>('full')
  const [showSeasonalFruits, setShowSeasonalFruits] = useState(true)

  // History tab state
  const [pdfList, setPdfList] = useState<PdfListItem[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [deleteJobId, setDeleteJobId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Load PDF list when switching to history tab
  useEffect(() => {
    if (activeTab === 'history') {
      loadPdfList()
    }
  }, [activeTab])

  const loadPdfList = async () => {
    setLoadingList(true)
    try {
      const response = await pdfApi.list()
      setPdfList(response.items || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load PDF list')
    } finally {
      setLoadingList(false)
    }
  }

  const handleDeletePdf = async () => {
    if (!deleteJobId) return

    setDeleting(true)
    try {
      await pdfApi.delete(deleteJobId)
      setPdfList(prev => prev.filter(p => p.job_id !== deleteJobId))
      setDeleteJobId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete PDF')
    } finally {
      setDeleting(false)
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return dateStr
    }
  }

  const getPdfName = (pdf: PdfListItem) => {
    const from = pdf.date_from?.substring(0, 10) || ''
    const to = pdf.date_to?.substring(0, 10) || ''
    return `${from} → ${to}`
  }

  const handleBack = () => {
    navigate('/')
  }

  const handleSearch = async () => {
    if (!startDate || !endDate) {
      setError('Please select both start and end dates')
      return
    }

    setLoading(true)
    setError(null)
    setMonthCounts([])
    setTotalArticles(0)
    setPdfUrl(null)
    setPdfStatus(null)

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

      if (allArticles.length === 0) {
        setError('No articles found in this date range')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch articles')
    } finally {
      setLoading(false)
    }
  }

  const pollJobStatus = async (jobId: string) => {
    try {
      const job = await pdfApi.status(jobId)

      // Update progress from real backend data
      setPdfProgress(job.progress || 0)
      setPdfProgressMessage(job.progress_message || '')

      if (job.status === 'DONE') {
        setPdfStatus('done')
        setPdfUrl(job.pdf_url || null)
        setGenerating(false)
      } else if (job.status === 'ERROR') {
        setPdfStatus('error')
        setError(job.error_message || 'PDF generation failed')
        setGenerating(false)
      } else {
        // Still running, poll more frequently for responsiveness
        setTimeout(() => pollJobStatus(jobId), 1000)
      }
    } catch (err) {
      setPdfStatus('error')
      setError(err instanceof Error ? err.message : 'Failed to check PDF status')
      setGenerating(false)
    }
  }

  const handleGeneratePdf = async () => {
    if (!startDate || !endDate) return

    setGenerating(true)
    setPdfStatus('generating')
    setPdfProgress(0)
    setPdfProgressMessage('Démarrage...')
    setPdfUrl(null)
    setError(null)

    try {
      // Start PDF generation
      const response = await pdfApi.create({
        from: startDate,
        to: endDate,
        options: {
          mosaic_layout: mosaicLayout,
          show_seasonal_fruits: showSeasonalFruits,
        },
      })

      // Update with response data
      setPdfProgress(response.progress || 0)
      setPdfProgressMessage(response.progress_message || '')

      // If response already has PDF URL (sync generation), we're done
      if (response.status === 'DONE' && response.pdf_url) {
        setPdfProgress(100)
        setPdfStatus('done')
        setPdfUrl(response.pdf_url)
        setGenerating(false)
      } else {
        // Poll for completion
        pollJobStatus(response.job_id)
      }
    } catch (err) {
      setPdfStatus('error')
      setError(err instanceof Error ? err.message : 'Failed to start PDF generation')
      setGenerating(false)
    }
  }

  const handleDownloadPdf = () => {
    if (pdfUrl) {
      window.open(pdfUrl, '_blank')
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />

      {/* Back button and title */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-14 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
            disabled={loading || generating}
          >
            <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M15 19l-7-7 7-7"></path>
            </svg>
          </button>
          <h2 className="text-lg font-semibold text-gray-900">PDF Export</h2>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3">
          <button
            onClick={() => setActiveTab('generate')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'generate'
                ? 'bg-primary-100 text-primary-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Générer
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'history'
                ? 'bg-primary-100 text-primary-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Historique
          </button>
        </div>
      </div>

      {/* HISTORY TAB */}
      {activeTab === 'history' && (
        <div className="flex-1 p-4 pb-20">
          {loadingList ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : pdfList.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              Aucun PDF généré
            </div>
          ) : (
            <div className="space-y-3">
              {pdfList.map((pdf) => (
                <div
                  key={pdf.job_id}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {getPdfName(pdf)}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Créé le {formatDate(pdf.created_at)}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        par {pdf.created_by}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <a
                        href={pdf.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        title="Voir le PDF"
                      >
                        <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                          <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                        </svg>
                      </a>
                      <button
                        onClick={() => setDeleteJobId(pdf.job_id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Supprimer"
                      >
                        <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                          <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* GENERATE TAB - Date filters */}
      {activeTab === 'generate' && (
        <>
      {/* Date filters */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="flex-1 min-w-0">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={loading || generating}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 text-gray-900 bg-white appearance-none"
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={loading || generating}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 text-gray-900 bg-white appearance-none"
              />
            </div>
          </div>
          <Button
            onClick={handleSearch}
            disabled={loading || generating || !startDate || !endDate}
            fullWidth
          >
            {loading ? 'Loading...' : 'Search Articles'}
          </Button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Loading spinner */}
      {loading && (
        <div className="flex-1 flex items-center justify-center py-12">
          <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
        </div>
      )}

      {/* Results */}
      {!loading && monthCounts.length > 0 && (
        <div className="flex-1 p-4 pb-24">
          {/* Summary */}
          <div className="bg-white rounded-lg shadow-md p-4 mb-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Summary</h3>
            <p className="text-gray-600">
              <span className="font-medium text-primary-600">{totalArticles}</span> article{totalArticles > 1 ? 's' : ''} found
              {' '}across{' '}
              <span className="font-medium text-primary-600">{monthCounts.length}</span> month{monthCounts.length > 1 ? 's' : ''}
            </p>
          </div>

          {/* Month breakdown */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700">Articles by Month</h3>
            </div>
            <ul className="divide-y divide-gray-100">
              {monthCounts.map((month) => (
                <li key={month.key} className="px-4 py-3 flex justify-between items-center">
                  <span className="text-gray-900">{month.label}</span>
                  <span className="bg-primary-100 text-primary-700 px-2 py-1 rounded-full text-sm font-medium">
                    {month.count}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* PDF Options */}
          {!generating && pdfStatus !== 'done' && (
            <div className="bg-white rounded-lg shadow-md p-4 mt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Options</h3>

              {/* Month divider layout */}
              <div className="mb-4">
                <label className="block text-sm text-gray-600 mb-2">Style des intercalaires de mois</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMosaicLayout('full')}
                    className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-colors ${
                      mosaicLayout === 'full'
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Mosaïque pleine
                  </button>
                  <button
                    onClick={() => setMosaicLayout('centered')}
                    className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-colors ${
                      mosaicLayout === 'centered'
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Mosaïque centrée
                  </button>
                </div>
              </div>

              {/* Seasonal fruits toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showSeasonalFruits}
                  onChange={(e) => setShowSeasonalFruits(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Afficher fruits/légumes de saison</span>
              </label>
            </div>
          )}

          {/* PDF Generation Progress */}
          {generating && (
            <div className="bg-white rounded-lg shadow-md p-4 mt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Génération du PDF...</h3>
              <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                <div
                  className="bg-primary-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${pdfProgress}%` }}
                ></div>
              </div>
              <p className="text-sm text-gray-600 text-center font-medium">{pdfProgress}%</p>
              {pdfProgressMessage && (
                <p className="text-xs text-gray-500 text-center mt-1">{pdfProgressMessage}</p>
              )}
            </div>
          )}

          {/* PDF Ready */}
          {pdfStatus === 'done' && pdfUrl && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-green-600 flex-shrink-0" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <div className="flex-1">
                  <p className="text-green-800 font-medium">PDF generated successfully!</p>
                  <p className="text-green-600 text-sm">Click the button below to download.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom buttons */}
      {activeTab === 'generate' && !loading && monthCounts.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-20">
          <div className="max-w-content mx-auto space-y-2">
            {pdfStatus === 'done' && pdfUrl ? (
              <>
                <Button
                  onClick={handleDownloadPdf}
                  fullWidth
                >
                  <svg className="w-5 h-5 mr-2" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                    <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                  </svg>
                  Download PDF
                </Button>
                <Button
                  onClick={handleGeneratePdf}
                  variant="secondary"
                  fullWidth
                >
                  <svg className="w-5 h-5 mr-2" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                    <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                  </svg>
                  Regenerate PDF
                </Button>
              </>
            ) : (
              <Button
                onClick={handleGeneratePdf}
                disabled={generating}
                fullWidth
              >
                {generating ? (
                  <>
                    <div className="w-5 h-5 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Generating...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 mr-2" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                      <path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    Generate PDF
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      )}
        </>
      )}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={!!deleteJobId}
        title="Supprimer le PDF ?"
        message="Le PDF sera définitivement supprimé de Google Drive."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        onConfirm={handleDeletePdf}
        onCancel={() => setDeleteJobId(null)}
        variant="danger"
        isLoading={deleting}
      />
    </div>
  )
}
