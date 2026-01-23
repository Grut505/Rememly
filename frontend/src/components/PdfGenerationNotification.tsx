import { usePdfGenerationStore } from '../stores/pdfGenerationStore'

export function PdfGenerationNotification() {
  const {
    isGenerating,
    progress,
    progressMessage,
    error,
    pdfUrl,
    showSuccess,
    dismissSuccess,
    dismissError,
  } = usePdfGenerationStore()

  // Don't show anything if nothing to show
  if (!isGenerating && !showSuccess && !error) {
    return null
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 max-w-md mx-auto">
      {/* Generating state */}
      {isGenerating && (
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4 animate-slide-up">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-primary-600 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">Génération du PDF...</p>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-600 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 flex-shrink-0">{progress}%</span>
              </div>
              {progressMessage && (
                <p className="text-xs text-gray-500 mt-0.5 truncate">{progressMessage}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Success state */}
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
