import { useState } from 'react'
import { Button } from '../../ui/Button'
import { articlesApi } from '../../api/articles'
import { pdfApi } from '../../api/pdf'
import { Article } from '../../api/types'
import { getMonthYear } from '../../utils/date'

interface PdfGenerateModalProps {
  isOpen: boolean
  onClose: () => void
  onComplete: (pdfUrl: string) => void
}

interface MonthCount {
  key: string
  label: string
  count: number
}

type Step = 'dates' | 'preview' | 'options' | 'generating' | 'done'

export function PdfGenerateModal({ isOpen, onClose, onComplete }: PdfGenerateModalProps) {
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

  // Generation result
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  const reset = () => {
    setStep('dates')
    setStartDate('')
    setEndDate('')
    setMonthCounts([])
    setTotalArticles(0)
    setError(null)
    setPdfUrl(null)
    setMosaicLayout('full')
    setShowSeasonalFruits(true)
  }

  const handleClose = () => {
    if (step === 'generating') return // Don't allow closing during generation
    reset()
    onClose()
  }

  const handleSearchArticles = async () => {
    if (!startDate || !endDate) {
      setError('Veuillez sélectionner les dates de début et de fin')
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

      if (allArticles.length === 0) {
        setError('Aucun article trouvé pour cette période')
      } else {
        setStep('preview')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = async () => {
    setStep('generating')
    setError(null)

    try {
      const response = await pdfApi.create({
        from: startDate,
        to: endDate,
        options: {
          mosaic_layout: mosaicLayout,
          show_seasonal_fruits: showSeasonalFruits,
        },
      })

      if (response.status === 'DONE' && response.pdf_url) {
        setPdfUrl(response.pdf_url)
        setStep('done')
      } else if (response.status === 'ERROR') {
        setError('La génération du PDF a échoué')
        setStep('options')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la génération')
      setStep('options')
    }
  }

  const handleViewPdf = () => {
    if (pdfUrl) {
      window.open(pdfUrl, '_blank')
    }
  }

  const handleFinish = () => {
    if (pdfUrl) {
      onComplete(pdfUrl)
    }
    reset()
    onClose()
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
            {step === 'dates' && 'Sélectionner la période'}
            {step === 'preview' && 'Aperçu des articles'}
            {step === 'options' && 'Options de génération'}
            {step === 'generating' && 'Génération en cours'}
            {step === 'done' && 'PDF prêt !'}
          </h3>
          {step !== 'generating' && (
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
                  Date de début
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={loading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date de fin
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={loading}
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
                  <h4 className="text-sm font-medium text-gray-700">Détail par mois</h4>
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
              {/* Month divider layout */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Style des intercalaires de mois
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
                    Mosaïque pleine
                  </button>
                  <button
                    onClick={() => setMosaicLayout('centered')}
                    className={`flex-1 py-2.5 px-3 rounded-lg border text-sm transition-colors ${
                      mosaicLayout === 'centered'
                        ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Mosaïque centrée
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
                  <span className="text-sm font-medium text-gray-700">Fruits & légumes de saison</span>
                  <p className="text-xs text-gray-500">Décorations autour des intercalaires</p>
                </div>
              </label>

              {/* Summary reminder */}
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                <strong>{totalArticles}</strong> articles du{' '}
                <strong>{new Date(startDate).toLocaleDateString('fr-FR')}</strong> au{' '}
                <strong>{new Date(endDate).toLocaleDateString('fr-FR')}</strong>
              </div>
            </div>
          )}

          {/* Step: Generating */}
          {step === 'generating' && (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-100 mb-4">
                <svg className="w-8 h-8 text-primary-600 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <h4 className="text-lg font-medium text-gray-900 mb-2">Génération en cours...</h4>
              <p className="text-sm text-gray-500">
                Compilation de {totalArticles} articles en PDF.<br />
                Cela peut prendre quelques instants.
              </p>
            </div>
          )}

          {/* Step: Done */}
          {step === 'done' && (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
              <h4 className="text-lg font-medium text-gray-900 mb-2">PDF généré avec succès !</h4>
              <p className="text-sm text-gray-500 mb-4">
                Votre livre de souvenirs est prêt.
              </p>
              <Button onClick={handleViewPdf} fullWidth>
                <svg className="w-5 h-5 mr-2" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                  <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                </svg>
                Voir le PDF
              </Button>
            </div>
          )}
        </div>

        {/* Footer with navigation buttons */}
        {step !== 'generating' && step !== 'done' && (
          <div className="px-4 py-3 border-t border-gray-200 flex gap-3">
            {step === 'dates' && (
              <>
                <Button variant="secondary" onClick={handleClose} fullWidth>
                  Annuler
                </Button>
                <Button
                  onClick={handleSearchArticles}
                  disabled={!startDate || !endDate || loading}
                  fullWidth
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Recherche...
                    </>
                  ) : (
                    'Suivant'
                  )}
                </Button>
              </>
            )}

            {step === 'preview' && (
              <>
                <Button variant="secondary" onClick={() => setStep('dates')} fullWidth>
                  Retour
                </Button>
                <Button onClick={() => setStep('options')} fullWidth>
                  Suivant
                </Button>
              </>
            )}

            {step === 'options' && (
              <>
                <Button variant="secondary" onClick={() => setStep('preview')} fullWidth>
                  Retour
                </Button>
                <Button onClick={handleGenerate} fullWidth>
                  <svg className="w-5 h-5 mr-2" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                    <path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                  </svg>
                  Générer le PDF
                </Button>
              </>
            )}
          </div>
        )}

        {/* Footer for done state */}
        {step === 'done' && (
          <div className="px-4 py-3 border-t border-gray-200">
            <Button variant="secondary" onClick={handleFinish} fullWidth>
              Fermer
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
