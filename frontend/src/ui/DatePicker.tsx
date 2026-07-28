import { useState } from 'react'
import { Modal } from './Modal'

interface DatePickerProps {
  label?: string
  value: string // 'YYYY-MM-DD' or ''
  onChange: (value: string) => void
  min?: string
  max?: string
  placeholder?: string
  className?: string
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function toDateString(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

function parseDateString(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) }
}

function formatDisplay(value: string) {
  const parsed = parseDateString(value)
  if (!parsed) return ''
  const date = new Date(parsed.year, parsed.month, parsed.day)
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function DatePicker({ label, value, onChange, min, max, placeholder = 'Select date', className = '' }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const parsedValue = parseDateString(value)
  const today = new Date()
  const [viewYear, setViewYear] = useState(parsedValue?.year ?? today.getFullYear())
  const [viewMonth, setViewMonth] = useState(parsedValue?.month ?? today.getMonth())

  const minParsed = min ? parseDateString(min) : null
  const maxParsed = max ? parseDateString(max) : null

  const open = () => {
    setViewYear(parsedValue?.year ?? today.getFullYear())
    setViewMonth(parsedValue?.month ?? today.getMonth())
    setIsOpen(true)
  }

  const goToPreviousMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(viewYear - 1)
    } else {
      setViewMonth(viewMonth - 1)
    }
  }

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(viewYear + 1)
    } else {
      setViewMonth(viewMonth + 1)
    }
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  // JS getDay(): 0=Sunday..6=Saturday - convert to Monday-first index (0=Mon..6=Sun)
  const firstWeekday = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7

  const isDisabled = (year: number, month: number, day: number) => {
    const key = year * 10000 + (month + 1) * 100 + day
    if (minParsed) {
      const minKey = minParsed.year * 10000 + (minParsed.month + 1) * 100 + minParsed.day
      if (key < minKey) return true
    }
    if (maxParsed) {
      const maxKey = maxParsed.year * 10000 + (maxParsed.month + 1) * 100 + maxParsed.day
      if (key > maxKey) return true
    }
    return false
  }

  const cells: Array<{ day: number } | null> = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) cells.push({ day })

  const isSelected = (day: number) =>
    !!parsedValue && parsedValue.year === viewYear && parsedValue.month === viewMonth && parsedValue.day === day

  const isToday = (day: number) =>
    viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate()

  const handleSelectDay = (day: number) => {
    if (isDisabled(viewYear, viewMonth, day)) return
    onChange(toDateString(viewYear, viewMonth, day))
    setIsOpen(false)
  }

  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <button
        type="button"
        onClick={open}
        className="w-full flex items-center justify-between gap-2 px-4 py-2 border border-gray-300 rounded-lg text-left text-sm touch-manipulation focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
          <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
        </svg>
      </button>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={label || 'Select date'} align="center">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={goToPreviousMonth}
              className="p-2 rounded-lg hover:bg-gray-100 touch-manipulation"
              aria-label="Previous month"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M15 19l-7-7 7-7"></path>
              </svg>
            </button>
            <div className="text-sm font-semibold text-gray-900">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </div>
            <button
              type="button"
              onClick={goToNextMonth}
              className="p-2 rounded-lg hover:bg-gray-100 touch-manipulation"
              aria-label="Next month"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M9 5l7 7-7 7"></path>
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((wd) => (
              <div key={wd} className="text-center text-xs font-medium text-gray-400 py-1">
                {wd}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, idx) => {
              if (!cell) return <div key={`empty-${idx}`} />
              const disabled = isDisabled(viewYear, viewMonth, cell.day)
              const selected = isSelected(cell.day)
              return (
                <button
                  key={cell.day}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSelectDay(cell.day)}
                  className={`aspect-square rounded-lg text-sm font-medium touch-manipulation transition-colors ${
                    selected
                      ? 'bg-primary-600 text-white'
                      : disabled
                        ? 'text-gray-300 cursor-not-allowed'
                        : isToday(cell.day)
                          ? 'text-primary-600 border border-primary-300 hover:bg-primary-50'
                          : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {cell.day}
                </button>
              )
            })}
          </div>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => {
                onChange('')
                setIsOpen(false)
              }}
              className="text-sm text-gray-500 hover:text-gray-700 touch-manipulation"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date()
                if (isDisabled(now.getFullYear(), now.getMonth(), now.getDate())) return
                onChange(toDateString(now.getFullYear(), now.getMonth(), now.getDate()))
                setIsOpen(false)
              }}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium touch-manipulation"
            >
              Today
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
