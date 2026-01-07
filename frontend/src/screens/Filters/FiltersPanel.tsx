import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { MONTHS_FR } from '../../utils/constants'
import { getCurrentYear } from '../../utils/date'

export function FiltersPanel() {
  const navigate = useNavigate()
  const [year, setYear] = useState(getCurrentYear().toString())
  const [month, setMonth] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const handleApply = () => {
    // TODO: Apply filters to articles list
    navigate('/')
  }

  const handleReset = () => {
    setYear(getCurrentYear().toString())
    setMonth('')
    setDateFrom('')
    setDateTo('')
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center">
        <button
          onClick={() => navigate('/')}
          className="text-gray-600 touch-manipulation"
        >
          ← Back
        </button>
        <h1 className="text-lg font-semibold ml-4">Filters</h1>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
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
      <div className="bg-white border-t border-gray-200 p-4 space-y-2">
        <Button onClick={handleApply} fullWidth>
          Apply Filters
        </Button>
        <Button variant="secondary" onClick={handleReset} fullWidth>
          Reset
        </Button>
      </div>
    </div>
  )
}
