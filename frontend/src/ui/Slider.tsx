interface SliderProps {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  label?: string
  formatValue?: (value: number) => string
  className?: string
}

export function Slider({ value, onChange, min, max, step = 1, label, formatValue, className = '' }: SliderProps) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next))
  const displayValue = formatValue ? formatValue(value) : String(value)

  return (
    // The control group (buttons + range + value) is one flex item so it
    // wraps as a whole onto its own line when the row is too narrow to fit
    // it next to the label (e.g. a long label on mobile), instead of the
    // range input getting squeezed down to nothing.
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`}>
      {label && <span className="text-xs text-gray-500 flex-shrink-0">{label}</span>}
      <div className="flex items-center gap-2 flex-1 min-w-[10rem]">
        <button
          type="button"
          onClick={() => onChange(clamp(value - step))}
          disabled={value <= min}
          className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
          aria-label="Decrease"
        >
          −
        </button>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="app-slider flex-1 min-w-0"
        />
        <button
          type="button"
          onClick={() => onChange(clamp(value + step))}
          disabled={value >= max}
          className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
          aria-label="Increase"
        >
          +
        </button>
        <span className="text-xs text-gray-600 min-w-[2.5rem] text-right flex-shrink-0">{displayValue}</span>
      </div>
    </div>
  )
}
