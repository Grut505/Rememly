import { useEffect, useRef } from 'react'

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

const HOLD_INITIAL_DELAY_MS = 400
const HOLD_REPEAT_INTERVAL_MS = 90

// Press-and-hold auto-repeat for the +/- buttons (PC and mobile, via
// Pointer Events which cover both mouse and touch) - a single tap still
// fires exactly one step via onClick, but holding the button down starts
// repeating the step after a short delay, like a native stepper.
function useHoldRepeat(onStep: () => void) {
  const onStepRef = useRef(onStep)
  onStepRef.current = onStep

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Tracks whether the hold-repeat already applied at least one step during
  // the current press, so the click event that fires on release doesn't
  // apply an extra, unwanted step on top of what the hold already did.
  const heldRef = useRef(false)

  const clearTimers = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (intervalRef.current) clearInterval(intervalRef.current)
    timeoutRef.current = null
    intervalRef.current = null
  }

  useEffect(() => clearTimers, [])

  const start = () => {
    heldRef.current = false
    clearTimers()
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        heldRef.current = true
        onStepRef.current()
      }, HOLD_REPEAT_INTERVAL_MS)
    }, HOLD_INITIAL_DELAY_MS)
  }

  const stop = () => {
    clearTimers()
  }

  const handleClick = () => {
    if (heldRef.current) {
      heldRef.current = false
      return
    }
    onStepRef.current()
  }

  return {
    onPointerDown: start,
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onClick: handleClick,
  }
}

export function Slider({ value, onChange, min, max, step = 1, label, formatValue, className = '' }: SliderProps) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next))
  const displayValue = formatValue ? formatValue(value) : String(value)

  const decrementHandlers = useHoldRepeat(() => onChange(clamp(value - step)))
  const incrementHandlers = useHoldRepeat(() => onChange(clamp(value + step)))

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
          {...decrementHandlers}
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
          {...incrementHandlers}
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
