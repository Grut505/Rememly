import { useState, ReactNode } from 'react'

interface CollapsibleSectionProps {
  title: string
  headerExtra?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}

export function CollapsibleSection({ title, headerExtra, defaultOpen = false, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex-1 flex items-center justify-between gap-2 text-left"
        >
          <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
          <svg
            className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path d="M19 9l-7 7-7-7"></path>
          </svg>
        </button>
        {headerExtra}
      </div>
      {open && <div className="mt-3">{children}</div>}
    </div>
  )
}
