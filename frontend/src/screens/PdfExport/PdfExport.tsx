import { useState, useEffect, useCallback } from 'react'
import { AppHeader } from '../../ui/AppHeader'
import { Button } from '../../ui/Button'
import { Spinner } from '../../ui/Spinner'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { Switch } from '../../ui/Switch'
import { pdfApi, PdfListItem } from '../../api/pdf'
import { PdfGenerateModal } from './PdfGenerateModal'
import { FloatingActionButton } from '../../ui/FloatingActionButton'
import { usePdfGenerationStore } from '../../stores/pdfGenerationStore'
import { useAuth } from '../../hooks/useAuth'
import { useProfile } from '../../contexts/ProfileContext'

type SortField = 'created_at' | 'date_from' | 'created_by'
type SortOrder = 'asc' | 'desc'

export function PdfExport() {
  const { user } = useAuth()
  const { profile } = useProfile()

  // List state
  const [pdfList, setPdfList] = useState<PdfListItem[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [filterAuthor, setFilterAuthor] = useState<string>('')
  const [mergeFilter, setMergeFilter] = useState<'all' | 'merged' | 'pending'>('all')
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
  const [cleanupJobId, setCleanupJobId] = useState<string | null>(null)

  // Cancel state
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null)
  const [mergingJobIds, setMergingJobIds] = useState<Set<string>>(new Set())
  const [cleaningJobIds, setCleaningJobIds] = useState<Set<string>>(new Set())

  // Generate modal
  const [showGenerateModal, setShowGenerateModal] = useState(false)

  // Load PDF list (including in-progress jobs)
  const loadPdfList = useCallback(async () => {
    setLoadingList(true)
    setError(null)
    try {
      const response = await pdfApi.list({ include_in_progress: true })
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

  // Track previous statuses to detect completion
  const [previousStatuses, setPreviousStatuses] = useState<Map<string, string>>(new Map())
  const { setLastCompletedJob } = usePdfGenerationStore()

  // Separate in-progress and completed jobs
  const inProgressJobs = pdfList.filter(p => p.status === 'PENDING' || p.status === 'RUNNING')
  const completedJobs = pdfList.filter(p => p.status === 'DONE' || p.status === 'ERROR' || p.status === 'CANCELLED')

  // Poll only in-progress jobs (not the whole list)
  useEffect(() => {
    if (inProgressJobs.length === 0) return

    const interval = setInterval(async () => {
      // Fetch status for each in-progress job individually
      const updates = await Promise.all(
        inProgressJobs.map(async (job) => {
          try {
            const status = await pdfApi.status(job.job_id)
            return { ...status, job_id: job.job_id }
          } catch {
            return null
          }
        })
      )

      // Update the list with new statuses
      setPdfList(prev => prev.map(pdf => {
        const update = updates.find(u => u && u.job_id === pdf.job_id)
        if (update) {
          return {
            ...pdf,
            status: update.status,
            progress: update.progress,
            progress_message: update.progress_message,
            pdf_url: update.pdf_url,
            pdf_file_id: update.pdf_file_id,
            error_message: update.error_message,
          }
        }
        return pdf
      }))
    }, 2000) // Poll every 2 seconds

    return () => clearInterval(interval)
  }, [inProgressJobs.length])

  // Detect when a job completes
  useEffect(() => {
    const newStatuses = new Map(pdfList.map(p => [p.job_id, p.status]))

    // Check if any job just completed
    for (const [jobId, oldStatus] of previousStatuses) {
      const newStatus = newStatuses.get(jobId)
      if ((oldStatus === 'PENDING' || oldStatus === 'RUNNING') && newStatus === 'DONE') {
        // Job just completed successfully
        const job = pdfList.find(p => p.job_id === jobId)
        if (job) {
          setLastCompletedJob(job)
        }
      }
    }

    setPreviousStatuses(newStatuses)
  }, [pdfList, previousStatuses, setLastCompletedJob])

  // No full refresh on completion; list is updated locally.

  // Helper to safely parse dates
  const parseDate = (dateStr: string | undefined | null): number => {
    if (!dateStr) return 0
    const d = new Date(dateStr)
    return isNaN(d.getTime()) ? 0 : d.getTime()
  }

  // Filter and sort list (only completed jobs - in-progress jobs are shown separately)
  const filteredList = completedJobs
    .filter(pdf => !filterAuthor || pdf.created_by === filterAuthor)
    .filter(pdf => {
      if (mergeFilter === 'merged') {
        return !!pdf.pdf_url
      }
      if (mergeFilter === 'pending') {
        return pdf.status === 'DONE' && !pdf.pdf_url
      }
      return true
    })
    .sort((a, b) => {
      let comparison = 0
      if (sortField === 'created_at') {
        comparison = parseDate(a.created_at) - parseDate(b.created_at)
      } else if (sortField === 'date_from') {
        comparison = parseDate(a.date_from) - parseDate(b.date_from)
      } else if (sortField === 'created_by') {
        comparison = (a.created_by || '').localeCompare(b.created_by || '')
      }
      return sortOrder === 'desc' ? -comparison : comparison
    })

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

  const isMergeInProgress = (pdf: PdfListItem) => {
    const message = (pdf.progress_message || '').toLowerCase()
    if (pdf.status !== 'RUNNING') return false
    if (pdf.chunks_folder_id && !pdf.pdf_url) return true
    return message.includes('merge')
  }

  const getAuthorLabel = useCallback((email?: string, pseudo?: string) => {
    if (pseudo) return pseudo
    if (!email) return 'Unknown'
    if (user?.email && profile?.pseudo && email === user.email) {
      return profile.pseudo
    }
    const fromList = pdfList.find(p => p.created_by === email)?.created_by_pseudo
    return fromList || email.split('@')[0]
  }, [pdfList, profile?.pseudo, user?.email])

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

  const handleGenerateComplete = (job: PdfListItem | null) => {
    setShowGenerateModal(false)
    if (!job) return
    setPdfList(prev => {
      const existingIndex = prev.findIndex(p => p.job_id === job.job_id)
      if (existingIndex === -1) {
        return [job, ...prev]
      }
      const next = [...prev]
      next[existingIndex] = { ...next[existingIndex], ...job }
      return next
    })
    setAvailableAuthors(prev => (
      job.created_by && !prev.includes(job.created_by)
        ? [...prev, job.created_by]
        : prev
    ))
  }

  const handleCancelJob = async (jobId: string) => {
    setCancellingJobId(jobId)
    try {
      await pdfApi.cancel(jobId)
      // Job row is deleted on backend; remove it locally too
      setPdfList(prev => prev.filter(p => p.job_id !== jobId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel PDF generation')
    } finally {
      setCancellingJobId(null)
    }
  }

  const getDeleteMessage = (jobId: string | null) => {
    if (!jobId) return 'The PDF will be permanently deleted from Google Drive.'
    const job = pdfList.find(p => p.job_id === jobId)
    if (!job) return 'The PDF will be permanently deleted from Google Drive.'
    if (job.chunks_folder_id) {
      return 'The merged PDF, the chunks folder, and all temporary files will be permanently deleted from Google Drive.'
    }
    return 'The merged PDF will be permanently deleted from Google Drive.'
  }

  const handleCancelMerge = async (jobId: string) => {
    setCancellingJobId(jobId)
    try {
      await pdfApi.cancelMerge(jobId)
      setPdfList(prev => prev.map(pdf => {
        if (pdf.job_id !== jobId) return pdf
        return {
          ...pdf,
          status: 'ERROR',
          progress: 0,
          progress_message: 'Merge failed',
          error_message: 'Merge failed',
        }
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel merge')
    } finally {
      setCancellingJobId(null)
    }
  }

  const handleTriggerMerge = async (jobId: string) => {
    setMergingJobIds(prev => new Set(prev).add(jobId))
    try {
      await pdfApi.triggerMerge(jobId)
      setPdfList(prev => prev.map(pdf => {
        if (pdf.job_id !== jobId) return pdf
        return {
          ...pdf,
          status: 'RUNNING',
          progress: 10,
          progress_message: 'Merge queued',
          error_message: undefined,
        }
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger merge')
    } finally {
      setMergingJobIds(prev => {
        const next = new Set(prev)
        next.delete(jobId)
        return next
      })
    }
  }

  const handleCleanupMerge = async (jobId: string) => {
    setCleaningJobIds(prev => new Set(prev).add(jobId))
    try {
      await pdfApi.cleanupMerge(jobId)
      setPdfList(prev => prev.map(pdf => {
        if (pdf.job_id !== jobId) return pdf
        return {
          ...pdf,
          chunks_folder_id: undefined,
          chunks_folder_url: undefined,
          progress_message: 'Chunks cleaned',
        }
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clean chunks')
    } finally {
      setCleaningJobIds(prev => {
        const next = new Set(prev)
        next.delete(jobId)
        return next
      })
    }
  }

  const handleCleanupConfirm = async () => {
    if (!cleanupJobId) return
    await handleCleanupMerge(cleanupJobId)
    setCleanupJobId(null)
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />

      {/* Header bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-14 z-20">
        {/* Row 1: Title and actions */}
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900 flex-1">
            {selectionMode ? `${selectedIds.size} selected` : 'Generated PDFs'}
          </h2>

          <div className="flex items-center gap-4">
            {selectionMode && (
              <button
                onClick={selectAll}
                className="text-primary-600 hover:text-primary-700 touch-manipulation text-sm font-medium"
              >
                {selectedIds.size === filteredList.length ? 'Deselect all' : 'Select all'}
              </button>
            )}
            {filteredList.length > 0 && (
              <Switch
                checked={selectionMode}
                onChange={(checked) => {
                  setSelectionMode(checked)
                  if (!checked) setSelectedIds(new Set())
                }}
                label="Select"
              />
            )}
          </div>
        </div>

        {/* Row 2: Filters or selection info - fixed height to prevent layout shift */}
        <div className="flex items-center gap-2 mt-3 h-11 overflow-x-auto">
          {selectionMode ? (
            <span className="text-sm text-gray-500">
              Select PDFs to delete
            </span>
          ) : (
            <>
            {/* Author filter */}
            {availableAuthors.length > 1 && (
              <select
                value={filterAuthor}
                onChange={(e) => setFilterAuthor(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 max-w-32 truncate"
              >
              <option value="">Author</option>
              {availableAuthors.map(author => (
                <option key={author} value={author}>{getAuthorLabel(author)}</option>
              ))}
            </select>
          )}

            <select
              value={mergeFilter}
              onChange={(e) => setMergeFilter(e.target.value as 'all' | 'merged' | 'pending')}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 max-w-32 truncate"
            >
              <option value="all">All PDFs</option>
              <option value="merged">Merged</option>
              <option value="pending">Merge pending</option>
            </select>

            {/* Sort toggle */}
            <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs">
              <button
                onClick={() => {
                  if (sortField === 'created_at') {
                    setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')
                  } else {
                    setSortField('created_at')
                    setSortOrder('desc')
                  }
                }}
                className={`px-3 py-2.5 font-medium transition-colors flex items-center gap-1 ${
                  sortField === 'created_at'
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Created
                {sortField === 'created_at' && (
                  <span className="text-[10px]">{sortOrder === 'desc' ? '↓' : '↑'}</span>
                )}
              </button>
              <button
                onClick={() => {
                  if (sortField === 'date_from') {
                    setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')
                  } else {
                    setSortField('date_from')
                    setSortOrder('desc')
                  }
                }}
                className={`px-3 py-2.5 font-medium border-l border-gray-300 transition-colors flex items-center gap-1 ${
                  sortField === 'date_from'
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Period
                {sortField === 'date_from' && (
                  <span className="text-[10px]">{sortOrder === 'desc' ? '↓' : '↑'}</span>
                )}
              </button>
              <button
                onClick={() => {
                  if (sortField === 'created_by') {
                    setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')
                  } else {
                    setSortField('created_by')
                    setSortOrder('asc')
                  }
                }}
                className={`px-3 py-2.5 font-medium border-l border-gray-300 transition-colors flex items-center gap-1 ${
                  sortField === 'created_by'
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Author
                {sortField === 'created_by' && (
                  <span className="text-[10px]">{sortOrder === 'desc' ? '↓' : '↑'}</span>
                )}
              </button>
            </div>

            {/* Count */}
            <span className="text-sm text-gray-500 ml-auto">
              {filteredList.length} PDF{filteredList.length > 1 ? 's' : ''}
            </span>
          </>
        )}
        </div>
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
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center">
              <Spinner size="lg" />
              <p className="mt-4 text-gray-600">Loading PDFs...</p>
            </div>
          </div>
        ) : inProgressJobs.length === 0 && filteredList.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            <p className="text-gray-500 mb-2">
              {'No PDFs generated'}
            </p>
          </div>
        ) : (
          <>
            {/* Section 1: In-progress PDFs (dedicated section, no filters/sort) */}
            {inProgressJobs.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-500 mb-3">
                  Generating
                </h3>
                <div className="space-y-3">
                  {inProgressJobs.map((pdf) => (
                    <div
                      key={pdf.job_id}
                      className="bg-blue-50 border border-blue-200 rounded-lg p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900">
                            {formatDateRange(pdf.date_from, pdf.date_to)}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-1.5 bg-blue-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-600 rounded-full transition-all duration-300"
                                style={{ width: `${pdf.progress || 0}%` }}
                              />
                            </div>
                            <span className="text-xs text-blue-600 font-medium w-8">
                              {pdf.progress || 0}%
                            </span>
                          </div>
                          <p className="text-xs text-blue-500 mt-0.5">
                          {pdf.progress_message || 'Pending...'}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            by {getAuthorLabel(pdf.created_by, pdf.created_by_pseudo)}
                          </p>
                          {pdf.chunks_folder_url && (
                            <a
                              href={pdf.chunks_folder_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:text-blue-700 mt-0.5 inline-flex"
                              onClick={(e) => e.stopPropagation()}
                            >
                              PDF parts folder
                            </a>
                          )}
                        </div>
                        {/* Cancel button */}
                        <button
                          onClick={() => (
                            isMergeInProgress(pdf)
                              ? handleCancelMerge(pdf.job_id)
                              : handleCancelJob(pdf.job_id)
                          )}
                          disabled={cancellingJobId === pdf.job_id}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title={isMergeInProgress(pdf) ? 'Cancel merge' : 'Cancel'}
                        >
                          {cancellingJobId === pdf.job_id ? (
                            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                              <path d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section 2: Completed PDFs (normal list with filters/sort) */}
            {filteredList.length > 0 && (
              <div>
                {inProgressJobs.length > 0 && (
                  <h3 className="text-sm font-medium text-gray-500 mb-3">
                    Generated
                  </h3>
                )}
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
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900">
                              {formatDateRange(pdf.date_from, pdf.date_to)}
                            </p>
                            {pdf.pdf_url && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">
                                Merged
                              </span>
                            )}
                            {!pdf.pdf_url && pdf.status === 'DONE' && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-yellow-50 text-yellow-700 rounded">
                                Merge pending
                              </span>
                            )}
                            {pdf.status === 'ERROR' && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded">
                                Error
                              </span>
                            )}
                            {pdf.status === 'CANCELLED' && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded">
                                Cancelled
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            Created on {formatDate(pdf.created_at)}
                          </p>
                            {pdf.status === 'ERROR' && (
                              <p className="text-xs text-red-500 mt-0.5 truncate" title={pdf.error_message || 'Merge failed'}>
                                {pdf.error_message || 'Merge failed'}
                              </p>
                            )}
                          {pdf.status === 'DONE' && !pdf.pdf_url && pdf.progress_message && (
                            <p className="text-xs text-amber-600 mt-0.5 truncate" title={pdf.progress_message}>
                              {pdf.progress_message}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-0.5">
                            by {getAuthorLabel(pdf.created_by, pdf.created_by_pseudo)}
                          </p>
                          {pdf.chunks_folder_url && (
                            <a
                              href={pdf.chunks_folder_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:text-blue-700 mt-0.5 inline-flex"
                              onClick={(e) => e.stopPropagation()}
                            >
                              PDF parts folder
                            </a>
                          )}
                        </div>

                        {/* Actions (only in normal mode) */}
                        {!selectionMode && (
                          <div className="flex gap-1 flex-shrink-0">
                            {pdf.pdf_url && (
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
                            )}
                            {pdf.pdf_url && pdf.chunks_folder_id && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setCleanupJobId(pdf.job_id)
                                }}
                                className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
                                title="Clean chunks"
                                disabled={cleaningJobIds.has(pdf.job_id)}
                              >
                                {cleaningJobIds.has(pdf.job_id) ? (
                                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                ) : (
                                  <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                                    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6"></path>
                                  </svg>
                                )}
                              </button>
                            )}
                            {!pdf.pdf_url && (pdf.status === 'DONE' || pdf.status === 'ERROR') && pdf.chunks_folder_id && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleTriggerMerge(pdf.job_id)
                                }}
                                className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50"
                                title="Trigger merge"
                                disabled={mergingJobIds.has(pdf.job_id)}
                              >
                                {mergingJobIds.has(pdf.job_id) ? (
                                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                ) : (
                                  <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                                    <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                                  </svg>
                                )}
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setDeleteJobId(pdf.job_id)
                              }}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete"
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
              </div>
            )}
          </>
        )}
      </div>

      {/* Selection Mode Action Bar */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-300 p-4 z-50 shadow-lg">
          <div className="max-w-content mx-auto flex items-center justify-between gap-4">
            <span className="text-sm text-gray-600">
              {selectedIds.size} PDF{selectedIds.size > 1 ? 's' : ''} selected
            </span>
            <button
              onClick={() => setDeleteBulk(true)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* FAB to create new PDF */}
      {!selectionMode && (
        <div className="fixed bottom-20 left-0 right-0 z-30">
          <div className="max-w-content mx-auto px-4 flex justify-end">
            <FloatingActionButton
              onClick={() => setShowGenerateModal(true)}
              className="bg-primary-600 hover:bg-primary-700 active:bg-primary-800 transition-all hover:scale-105 active:scale-95"
              icon={
                <svg className="w-8 h-8" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                  <path d="M12 4v16m8-8H4"></path>
                </svg>
              }
            />
          </div>
        </div>
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
        title="Delete PDF?"
        message={getDeleteMessage(deleteJobId)}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDeleteSingle}
        onCancel={() => setDeleteJobId(null)}
        variant="danger"
        isLoading={deleting}
      />

      {/* Delete bulk confirmation dialog */}
      <ConfirmDialog
        isOpen={deleteBulk}
        title={`Delete ${selectedIds.size} PDF${selectedIds.size > 1 ? 's' : ''}?`}
        message="Selected PDFs will be permanently deleted from Google Drive."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDeleteBulk}
        onCancel={() => setDeleteBulk(false)}
        variant="danger"
        isLoading={deleting}
      />

      <ConfirmDialog
        isOpen={!!cleanupJobId}
        title="Clean chunks?"
        message="This will delete the chunks folder and move the merged PDF to Rememly/pdf."
        confirmLabel="Clean"
        cancelLabel="Cancel"
        onConfirm={handleCleanupConfirm}
        onCancel={() => setCleanupJobId(null)}
        variant="danger"
        isLoading={cleaningJobIds.has(cleanupJobId || '')}
      />
    </div>
  )
}
