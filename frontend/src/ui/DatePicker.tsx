interface DatePickerProps {
  label?: string
  value: string // 'YYYY-MM-DD' or '', or 'YYYY-MM-DDTHH:mm' when mode='datetime'
  onChange: (value: string) => void
  mode?: 'date' | 'datetime'
  min?: string
  max?: string
  placeholder?: string
  className?: string
}

// Native <input type="date"/"datetime-local">, matching the "Date and time"
// field in the article editor (DateTimeInput.tsx) - opens the OS's own
// date/time picker on mobile instead of a custom calendar-grid modal, which
// is a much better touch experience than anything we could build ourselves.
export function DatePicker({ label, value, onChange, mode = 'date', min, max, className = '' }: DatePickerProps) {
  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <input
        type={mode === 'datetime' ? 'datetime-local' : 'date'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        className="w-full min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 box-border"
        style={{ maxWidth: '100%' }}
      />
    </div>
  )
}
