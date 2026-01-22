interface DateTimeInputProps {
  value: string // ISO string
  onChange: (value: string) => void
}

export function DateTimeInput({ value, onChange }: DateTimeInputProps) {
  // Convert ISO string to datetime-local format (YYYY-MM-DDTHH:mm)
  const toLocalDateTime = (isoString: string): string => {
    const date = new Date(isoString)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  // Convert datetime-local format to ISO string
  const toISOString = (localDateTime: string): string => {
    return new Date(localDateTime).toISOString()
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(toISOString(e.target.value))
  }

  return (
    <div className="space-y-2 overflow-hidden">
      <label className="block text-sm font-medium text-gray-700">Date and time</label>
      <input
        type="datetime-local"
        value={toLocalDateTime(value)}
        onChange={handleChange}
        className="w-full min-w-0 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent box-border text-base"
        style={{ maxWidth: '100%' }}
      />
    </div>
  )
}
