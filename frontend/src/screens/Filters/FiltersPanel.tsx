import { useState, useEffect } from 'react'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { DatePicker } from '../../ui/DatePicker'
import { Switch } from '../../ui/Switch'
import { MONTHS_EN, isStandalonePWA } from '../../utils/constants'
import { getCurrentYear } from '../../utils/date'
import { articlesApi } from '../../api/articles'
import { useProjectsStore } from '../../state/projectsStore'

const DEFAULT_FILTERS: FilterValues = {
  year: '',
  month: '',
  dateFrom: '',
  dateTo: '',
  author: '',
  projectId: '',
  search: '',
  duplicatesOnly: false,
  statusFilter: 'all',
  sourceFilter: 'all',
}

interface FiltersPanelProps {
  initialFilters?: FilterValues
  onApply: (filters: FilterValues) => void
  onClose: () => void
}

export type StatusFilter = 'active' | 'draft' | 'all' | 'deleted'
type BaseStatus = 'active' | 'draft' | 'all'
export type SourceFilter = 'all' | 'famileo' | 'local'

export interface FilterValues {
  year: string
  month: string
  dateFrom: string
  dateTo: string
  author: string
  projectId: string
  search: string
  duplicatesOnly: boolean
  statusFilter: StatusFilter
  sourceFilter: SourceFilter
}

export function FiltersPanel({ initialFilters, onApply, onClose }: FiltersPanelProps) {
  const isStandalone = isStandalonePWA()
  const { projects, load: loadProjects } = useProjectsStore()
  const [year, setYear] = useState(initialFilters?.year ?? DEFAULT_FILTERS.year)
  const [month, setMonth] = useState(initialFilters?.month ?? DEFAULT_FILTERS.month)
  const [dateFrom, setDateFrom] = useState(initialFilters?.dateFrom ?? DEFAULT_FILTERS.dateFrom)
  const [dateTo, setDateTo] = useState(initialFilters?.dateTo ?? DEFAULT_FILTERS.dateTo)
  const [author, setAuthor] = useState(initialFilters?.author ?? DEFAULT_FILTERS.author)
  const [projectId, setProjectId] = useState(initialFilters?.projectId ?? DEFAULT_FILTERS.projectId)
  const [search, setSearch] = useState(initialFilters?.search ?? DEFAULT_FILTERS.search)
  const [duplicatesOnly, setDuplicatesOnly] = useState(initialFilters?.duplicatesOnly ?? DEFAULT_FILTERS.duplicatesOnly)
  // "Deleted" is an override, not a fourth option alongside All/Active/Draft:
  // baseStatus keeps whichever of those three was picked, and deletedOnly - when
  // on - overrides it to show only deleted articles, independently of baseStatus.
  const initialStatus = initialFilters?.statusFilter ?? DEFAULT_FILTERS.statusFilter
  const [baseStatus, setBaseStatus] = useState<BaseStatus>(initialStatus === 'deleted' ? 'all' : initialStatus)
  const [deletedOnly, setDeletedOnly] = useState(initialStatus === 'deleted')
  const statusFilter: StatusFilter = deletedOnly ? 'deleted' : baseStatus
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(initialFilters?.sourceFilter ?? DEFAULT_FILTERS.sourceFilter)
  const [authors, setAuthors] = useState<{ email: string; pseudo: string }[]>([])
  const [loadingAuthors, setLoadingAuthors] = useState(false)

  useEffect(() => {
    loadProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (initialFilters) {
      setYear(initialFilters.year ?? DEFAULT_FILTERS.year)
      setMonth(initialFilters.month ?? DEFAULT_FILTERS.month)
      setDateFrom(initialFilters.dateFrom ?? DEFAULT_FILTERS.dateFrom)
      setDateTo(initialFilters.dateTo ?? DEFAULT_FILTERS.dateTo)
      setAuthor(initialFilters.author ?? DEFAULT_FILTERS.author)
      setProjectId(initialFilters.projectId ?? DEFAULT_FILTERS.projectId)
      setSearch(initialFilters.search ?? DEFAULT_FILTERS.search)
      setDuplicatesOnly(initialFilters.duplicatesOnly ?? DEFAULT_FILTERS.duplicatesOnly)
      const nextStatus = initialFilters.statusFilter ?? DEFAULT_FILTERS.statusFilter
      setBaseStatus(nextStatus === 'deleted' ? 'all' : nextStatus)
      setDeletedOnly(nextStatus === 'deleted')
      setSourceFilter(initialFilters.sourceFilter ?? DEFAULT_FILTERS.sourceFilter)
    }
  }, [initialFilters])

  useEffect(() => {
    let isMounted = true
    const loadAuthors = async () => {
      setLoadingAuthors(true)
      try {
        const response = await articlesApi.authors({
          status_filter: statusFilter,
          source_filter: sourceFilter,
        })
        if (isMounted) {
          setAuthors(response.authors || [])
        }
      } catch {
        if (isMounted) {
          setAuthors([])
        }
      } finally {
        if (isMounted) {
          setLoadingAuthors(false)
        }
      }
    }
    loadAuthors()
    return () => {
      isMounted = false
    }
  }, [statusFilter, sourceFilter])

  const handleApply = () => {
    onApply({ year, month, dateFrom, dateTo, author, projectId, search, duplicatesOnly, statusFilter, sourceFilter })
    onClose()
  }

  const handleReset = () => {
    setYear(DEFAULT_FILTERS.year)
    setMonth(DEFAULT_FILTERS.month)
    setDateFrom(DEFAULT_FILTERS.dateFrom)
    setDateTo(DEFAULT_FILTERS.dateTo)
    setAuthor(DEFAULT_FILTERS.author)
    setProjectId(DEFAULT_FILTERS.projectId)
    setSearch(DEFAULT_FILTERS.search)
    setDuplicatesOnly(DEFAULT_FILTERS.duplicatesOnly)
    setBaseStatus(DEFAULT_FILTERS.statusFilter as BaseStatus)
    setDeletedOnly(false)
    setSourceFilter(DEFAULT_FILTERS.sourceFilter)
    onApply(DEFAULT_FILTERS)
    onClose()
  }

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto overscroll-contain">
        {/* Search */}
        <Input
          type="text"
          label="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search in loaded articles..."
        />

        <div className={`grid gap-2 ${isStandalone ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
          {/* Year */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Year
            </label>
            <select
              value={year}
              onChange={(e) => {
                setYear(e.target.value)
                // Clear month if no year selected
                if (!e.target.value) {
                  setMonth('')
                }
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All years</option>
              {[...Array(10)].map((_, i) => {
                const y = getCurrentYear() - i
                return (
                  <option key={y} value={y}>
                    {y}
                  </option>
                )
              })}
            </select>
          </div>

          {/* Month - only enabled when a year is selected */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Month
            </label>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              disabled={!year}
              className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                !year ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''
              }`}
            >
              <option value="">All months</option>
              {MONTHS_EN.map((m, i) => (
                <option key={i} value={(i + 1).toString().padStart(2, '0')}>
                  {m}
                </option>
              ))}
            </select>
            {!year && (
              <p className="text-xs text-gray-500 mt-1">Select a year first</p>
            )}
          </div>
        </div>

        {/* Date Range */}
        <div className="flex gap-2 w-full">
          <div className="min-w-0 flex-1">
            <DatePicker
              label="From"
              value={dateFrom}
              onChange={(next) => {
                setDateFrom(next)
                if (dateTo && next && dateTo < next) {
                  setDateTo(next)
                }
              }}
              max={dateTo || undefined}
            />
          </div>
          <div className="min-w-0 flex-1">
            <DatePicker
              label="To"
              value={dateTo}
              onChange={(next) => {
                setDateTo(next)
                if (dateFrom && next && next < dateFrom) {
                  setDateFrom(next)
                }
              }}
              min={dateFrom || undefined}
            />
          </div>
        </div>

        {/* Author */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Author
          </label>
          <select
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            disabled={loadingAuthors}
            className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              loadingAuthors ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''
            }`}
          >
            {loadingAuthors ? (
              <option value="">Loading authors...</option>
            ) : (
              <>
                <option value="">All authors</option>
                {authors.map((a) => (
                  <option key={a.email} value={a.email}>
                    {a.pseudo || a.email.split('@')[0]}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>

        {/* Project */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Project
          </label>
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

        <label className="flex items-center gap-3 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={duplicatesOnly}
            onChange={(e) => setDuplicatesOnly(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          Show duplicates (Famileo)
        </label>

        {/* Status Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Status
          </label>
          <div className={`flex rounded-lg border border-gray-300 overflow-hidden ${deletedOnly ? 'opacity-50' : ''}`}>
            <button
              type="button"
              onClick={() => setBaseStatus('all')}
              disabled={deletedOnly}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                baseStatus === 'all'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              } ${deletedOnly ? 'cursor-not-allowed' : ''}`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setBaseStatus('active')}
              disabled={deletedOnly}
              className={`flex-1 px-3 py-2 text-sm font-medium border-l border-gray-300 transition-colors ${
                baseStatus === 'active'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              } ${deletedOnly ? 'cursor-not-allowed' : ''}`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setBaseStatus('draft')}
              disabled={deletedOnly}
              className={`flex-1 px-3 py-2 text-sm font-medium border-l border-gray-300 transition-colors ${
                baseStatus === 'draft'
                  ? 'bg-amber-500 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              } ${deletedOnly ? 'cursor-not-allowed' : ''}`}
            >
              Draft
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">All = Active + Draft</p>
          <div className="mt-2 flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
            <Switch checked={deletedOnly} onChange={setDeletedOnly} label="Deleted only" />
            {deletedOnly && (
              <span className="text-xs text-red-600 font-medium">Overrides the above</span>
            )}
          </div>
        </div>

        {/* Source Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Source
          </label>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button
              type="button"
              onClick={() => setSourceFilter('all')}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                sourceFilter === 'all'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter('famileo')}
              className={`flex-1 px-3 py-2 text-sm font-medium border-x border-gray-300 transition-colors ${
                sourceFilter === 'famileo'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Famileo
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter('local')}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                sourceFilter === 'local'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Local
            </button>
          </div>
        </div>
        </div>

        {/* Actions */}
        <div className="border-t border-gray-200 p-4 bg-white sticky bottom-0">
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleReset} fullWidth>
              Reset
            </Button>
            <Button onClick={handleApply} fullWidth>
              Apply Filters
            </Button>
          </div>
        </div>

      </div>
    </>
  )
}
