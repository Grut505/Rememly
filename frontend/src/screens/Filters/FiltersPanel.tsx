import { useState, useEffect } from 'react'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { MONTHS_EN } from '../../utils/constants'
import { getCurrentYear } from '../../utils/date'

const DEFAULT_FILTERS: FilterValues = {
  year: '',
  month: '',
  dateFrom: '',
  dateTo: '',
  statusFilter: 'active',
}

interface FiltersPanelProps {
  initialFilters?: FilterValues
  onApply: (filters: FilterValues) => void
  onClose: () => void
}

export type StatusFilter = 'active' | 'all' | 'deleted'

export interface FilterValues {
  year: string
  month: string
  dateFrom: string
  dateTo: string
  statusFilter: StatusFilter
}

export function FiltersPanel({ initialFilters, onApply, onClose }: FiltersPanelProps) {
  const [year, setYear] = useState(initialFilters?.year ?? DEFAULT_FILTERS.year)
  const [month, setMonth] = useState(initialFilters?.month ?? DEFAULT_FILTERS.month)
  const [dateFrom, setDateFrom] = useState(initialFilters?.dateFrom ?? DEFAULT_FILTERS.dateFrom)
  const [dateTo, setDateTo] = useState(initialFilters?.dateTo ?? DEFAULT_FILTERS.dateTo)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialFilters?.statusFilter ?? DEFAULT_FILTERS.statusFilter)

  useEffect(() => {
    if (initialFilters) {
      setYear(initialFilters.year ?? DEFAULT_FILTERS.year)
      setMonth(initialFilters.month ?? DEFAULT_FILTERS.month)
      setDateFrom(initialFilters.dateFrom ?? DEFAULT_FILTERS.dateFrom)
      setDateTo(initialFilters.dateTo ?? DEFAULT_FILTERS.dateTo)
      setStatusFilter(initialFilters.statusFilter ?? DEFAULT_FILTERS.statusFilter)
    }
  }, [initialFilters])

  const handleApply = () => {
    onApply({ year, month, dateFrom, dateTo, statusFilter })
    onClose()
  }

  const handleReset = () => {
    setYear(DEFAULT_FILTERS.year)
    setMonth(DEFAULT_FILTERS.month)
    setDateFrom(DEFAULT_FILTERS.dateFrom)
    setDateTo(DEFAULT_FILTERS.dateTo)
    setStatusFilter(DEFAULT_FILTERS.statusFilter)
    onApply(DEFAULT_FILTERS)
    onClose()
  }

  return (
    <>
      {/* Content */}
      <div className="p-4 space-y-6">
        {/* Year */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
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
          <label className="block text-sm font-medium text-gray-700 mb-2">
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

        {/* Date Range */}
        <div className="space-y-4">
          <Input
            type="date"
            label="From"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <Input
            type="date"
            label="To"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>

        {/* Status Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Status
          </label>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                statusFilter === 'active'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`flex-1 px-3 py-2 text-sm font-medium border-x border-gray-300 transition-colors ${
                statusFilter === 'all'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('deleted')}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                statusFilter === 'deleted'
                  ? 'bg-red-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Deleted
            </button>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="border-t border-gray-200 p-4 space-y-2">
        <Button onClick={handleApply} fullWidth>
          Apply Filters
        </Button>
        <Button variant="secondary" onClick={handleReset} fullWidth>
          Reset
        </Button>
      </div>
    </>
  )
}
