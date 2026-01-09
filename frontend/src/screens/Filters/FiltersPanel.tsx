import { useState, useEffect } from 'react'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { MONTHS_FR } from '../../utils/constants'
import { getCurrentYear } from '../../utils/date'

interface FiltersPanelProps {
  initialFilters?: FilterValues
  onApply: (filters: FilterValues) => void
  onClose: () => void
}

export interface FilterValues {
  year: string
  month: string
  dateFrom: string
  dateTo: string
}

export function FiltersPanel({ initialFilters, onApply, onClose }: FiltersPanelProps) {
  const [year, setYear] = useState(initialFilters?.year || getCurrentYear().toString())
  const [month, setMonth] = useState(initialFilters?.month || '')
  const [dateFrom, setDateFrom] = useState(initialFilters?.dateFrom || '')
  const [dateTo, setDateTo] = useState(initialFilters?.dateTo || '')

  useEffect(() => {
    if (initialFilters) {
      setYear(initialFilters.year || getCurrentYear().toString())
      setMonth(initialFilters.month || '')
      setDateFrom(initialFilters.dateFrom || '')
      setDateTo(initialFilters.dateTo || '')
    }
  }, [initialFilters])

  const handleApply = () => {
    onApply({ year, month, dateFrom, dateTo })
    onClose()
  }

  const handleReset = () => {
    const defaultFilters = {
      year: getCurrentYear().toString(),
      month: '',
      dateFrom: '',
      dateTo: '',
    }
    setYear(defaultFilters.year)
    setMonth(defaultFilters.month)
    setDateFrom(defaultFilters.dateFrom)
    setDateTo(defaultFilters.dateTo)
    onApply(defaultFilters)
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
            onChange={(e) => setYear(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {[...Array(5)].map((_, i) => {
              const y = getCurrentYear() - i
              return (
                <option key={y} value={y}>
                  {y}
                </option>
              )
            })}
          </select>
        </div>

        {/* Month */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Month
          </label>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All months</option>
            {MONTHS_FR.map((m, i) => (
              <option key={i} value={(i + 1).toString().padStart(2, '0')}>
                {m}
              </option>
            ))}
          </select>
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
