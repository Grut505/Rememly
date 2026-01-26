import { usePdfGenerationStore } from '../stores/pdfGenerationStore'

export function PdfGenerationNotification() {
  const {
    error,
    pdfUrl,
    showSuccess,
    lastCompletedJob,
    dismissSuccess,
    dismissError,
  } = usePdfGenerationStore()

  // Don't show anything if nothing to show
  // Progress is now shown directly in the PDF list
  if (!showSuccess && !error) {
    return null
  }

  // Format date range for the completed job
  const formatDateRange = (from: string, to: string) => {
    try {
      const fromDate = new Date(from)
      const toDate = new Date(to)
      const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }
      return `${fromDate.toLocaleDateString('fr-FR', options)} - ${toDate.toLocaleDateString('fr-FR', options)}`
    } catch {
      return `${from} - ${to}`
    }
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 max-w-md mx-auto">
      {/* Success state - PDF completed */}
      {showSuccess && pdfUrl && (
        <div className="bg-green-50 border border-green-200 rounded-lg shadow-lg p-4 animate-slide-up">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-green-600" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-green-800">PDF généré avec succès !</p>
              {lastCompletedJob && (
                <p className="text-xs text-green-600 mt-0.5">
                  {formatDateRange(lastCompletedJob.date_from, lastCompletedJob.date_to)}
                </p>
              )}
              <div className="flex gap-2 mt-2">
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4 mr-1" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                    <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                  </svg>
                  Voir
                </a>
                <button
                  onClick={dismissSuccess}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 rounded-lg transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
            <button
              onClick={dismissSuccess}
              className="text-green-400 hover:text-green-600"
            >
              <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg shadow-lg p-4 animate-slide-up">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-red-600" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-800">Erreur de génération</p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
            </div>
            <button
              onClick={dismissError}
              className="text-red-400 hover:text-red-600"
            >
              <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
