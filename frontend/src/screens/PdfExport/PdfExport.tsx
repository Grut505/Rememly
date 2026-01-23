import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppHeader } from '../../ui/AppHeader'
import { Button } from '../../ui/Button'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { pdfApi, PdfListItem } from '../../api/pdf'
import { PdfGenerateModal } from './PdfGenerateModal'

type SortField = 'created_at' | 'date_from'
type SortOrder = 'asc' | 'desc'

export function PdfExport() {
  const navigate = useNavigate()

  // List state
  const [pdfList, setPdfList] = useState<PdfListItem[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [filterYear, setFilterYear] = useState<string>('')
  const [filterAuthor, setFilterAuthor] = useState<string>('')
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [availableAuthors, setAvailableAuthors] = useState<string[]>([])

  // Selection mode for bulk delete
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Delete state
  const [deleteJobId, setDeleteJobId] = useState<string | null>(null)
  const [deleteBulk, setDeleteBulk] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Generate modal
  const [showGenerateModal, setShowGenerateModal] = useState(false)

  // Load PDF list
  const loadPdfList = useCallback(async () => {
    setLoadingList(true)
    setError(null)
    try {
      const response = await pdfApi.list()
      setPdfList(response.items || [])
      setAvailableAuthors(response.authors || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load PDF list')
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    loadPdfList()
  }, [loadPdfList])

  // Get unique years from list
  const availableYears = Array.from(
    new Set(pdfList.map(p => p.year).filter(Boolean))
  ).sort((a, b) => b - a)

  // Filter and sort list
  const filteredList = pdfList
    .filter(pdf => !filterYear || pdf.year === parseInt(filterYear))
    .filter(pdf => !filterAuthor || pdf.created_by === filterAuthor)
    .sort((a, b) => {
      let comparison = 0
      if (sortField === 'created_at') {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
        comparison = dateA - dateB
      } else if (sortField === 'date_from') {
        const dateA = a.date_from ? new Date(a.date_from).getTime() : 0
        const dateB = b.date_from ? new Date(b.date_from).getTime() : 0
        comparison = dateA - dateB
      }
      return sortOrder === 'desc' ? -comparison : comparison
    })

  const handleBack = () => {
    if (selectionMode) {
      setSelectionMode(false)
      setSelectedIds(new Set())
    } else {
      navigate('/')
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

  const formatDateRange = (from: string, to: string) => {
    try {
      const fromDate = new Date(from)
      const toDate = new Date(to)
      const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }
      return `${fromDate.toLocaleDateString('fr-FR', options)} → ${toDate.toLocaleDateString('fr-FR', options)}`
    } catch {
      return `${from} → ${to}`
    }
  }

  const toggleSelection = (jobId: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(jobId)) {
      newSelected.delete(jobId)
    } else {
      newSelected.add(jobId)
    }
    setSelectedIds(newSelected)
  }

  const selectAll = () => {
    if (selectedIds.size === filteredList.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredList.map(p => p.job_id)))
    }
  }

  const handleDeleteSingle = async () => {
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

  const handleDeleteBulk = async () => {
    if (selectedIds.size === 0) return

    setDeleting(true)
    try {
      for (const jobId of selectedIds) {
        await pdfApi.delete(jobId)
      }
      setPdfList(prev => prev.filter(p => !selectedIds.has(p.job_id)))
      setSelectedIds(new Set())
      setSelectionMode(false)
      setDeleteBulk(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete PDFs')
    } finally {
      setDeleting(false)
    }
  }

  const handleGenerateComplete = () => {
    setShowGenerateModal(false)
    loadPdfList()
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />

      {/* Header bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-14 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
          >
            <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M15 19l-7-7 7-7"></path>
            </svg>
          </button>
          <h2 className="text-lg font-semibold text-gray-900 flex-1">
            {selectionMode ? `${selectedIds.size} sélectionné(s)` : 'PDFs générés'}
          </h2>

          {selectionMode ? (
            <>
              <button
                onClick={selectAll}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {selectedIds.size === filteredList.length ? (
                  <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                    <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"></path>
                  </svg>
                )}
              </button>
              {selectedIds.size > 0 && (
                <button
                  onClick={() => setDeleteBulk(true)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                    <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                  </svg>
                </button>
              )}
            </>
          ) : (
            <button
              onClick={() => setSelectionMode(true)}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              title="Mode sélection"
            >
              <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path>
              </svg>
            </button>
          )}
        </div>

        {/* Filters */}
        {!selectionMode && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {/* Year filter */}
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Année</option>
              {availableYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>

            {/* Author filter */}
            {availableAuthors.length > 1 && (
              <select
                value={filterAuthor}
                onChange={(e) => setFilterAuthor(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 max-w-32 truncate"
              >
                <option value="">Auteur</option>
                {availableAuthors.map(author => (
                  <option key={author} value={author}>{author.split('@')[0]}</option>
                ))}
              </select>
            )}

            {/* Sort */}
            <select
              value={`${sortField}_${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('_') as [SortField, SortOrder]
                setSortField(field)
                setSortOrder(order)
              }}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="created_at_desc">Plus récent</option>
              <option value="created_at_asc">Plus ancien</option>
              <option value="date_from_desc">Période ↓</option>
              <option value="date_from_asc">Période ↑</option>
            </select>

            {/* Count */}
            <span className="text-sm text-gray-500 ml-auto">
              {filteredList.length} PDF{filteredList.length > 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            ×
          </button>
        </div>
      )}

      {/* List content */}
      <div className="flex-1 p-4 pb-24">
        {loadingList ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            <p className="text-gray-500 mb-2">
              {filterYear ? 'Aucun PDF pour cette année' : 'Aucun PDF généré'}
            </p>
            <Button
              onClick={() => setShowGenerateModal(true)}
              variant="primary"
            >
              Créer mon premier PDF
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredList.map((pdf) => (
              <div
                key={pdf.job_id}
                onClick={() => selectionMode && toggleSelection(pdf.job_id)}
                className={`bg-white rounded-lg shadow-sm border transition-colors ${
                  selectionMode
                    ? selectedIds.has(pdf.job_id)
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                    : 'border-gray-200'
                } p-4 ${selectionMode ? 'cursor-pointer' : ''}`}
              >
                <div className="flex items-start gap-3">
                  {/* Selection checkbox */}
                  {selectionMode && (
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      selectedIds.has(pdf.job_id)
                        ? 'bg-primary-600 border-primary-600'
                        : 'border-gray-300'
                    }`}>
                      {selectedIds.has(pdf.job_id) && (
                        <svg className="w-3 h-3 text-white" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" viewBox="0 0 24 24" stroke="currentColor">
                          <path d="M5 13l4 4L19 7"></path>
                        </svg>
                      )}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">
                      {formatDateRange(pdf.date_from, pdf.date_to)}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      Créé le {formatDate(pdf.created_at)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      par {pdf.created_by}
                    </p>
                  </div>

                  {/* Actions (only in normal mode) */}
                  {!selectionMode && (
                    <div className="flex gap-1 flex-shrink-0">
                      <a
                        href={pdf.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        title="Voir le PDF"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                          <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                        </svg>
                      </a>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteJobId(pdf.job_id)
                        }}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Supprimer"
                      >
                        <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                          <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FAB to create new PDF */}
      {!selectionMode && (
        <button
          onClick={() => setShowGenerateModal(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-primary-600 hover:bg-primary-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95 z-30"
          title="Nouveau PDF"
        >
          <svg className="w-7 h-7" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
            <path d="M12 4v16m8-8H4"></path>
          </svg>
        </button>
      )}

      {/* Generate modal */}
      <PdfGenerateModal
        isOpen={showGenerateModal}
        onClose={() => setShowGenerateModal(false)}
        onComplete={handleGenerateComplete}
      />

      {/* Delete single confirmation dialog */}
      <ConfirmDialog
        isOpen={!!deleteJobId}
        title="Supprimer le PDF ?"
        message="Le PDF sera définitivement supprimé de Google Drive."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        onConfirm={handleDeleteSingle}
        onCancel={() => setDeleteJobId(null)}
        variant="danger"
        isLoading={deleting}
      />

      {/* Delete bulk confirmation dialog */}
      <ConfirmDialog
        isOpen={deleteBulk}
        title={`Supprimer ${selectedIds.size} PDF${selectedIds.size > 1 ? 's' : ''} ?`}
        message="Les PDFs sélectionnés seront définitivement supprimés de Google Drive."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        onConfirm={handleDeleteBulk}
        onCancel={() => setDeleteBulk(false)}
        variant="danger"
        isLoading={deleting}
      />
    </div>
  )
}
