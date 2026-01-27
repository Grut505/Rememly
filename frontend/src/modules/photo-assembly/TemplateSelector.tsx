import { useMemo, useState } from 'react'
import { LayoutTemplate } from './layoutRegistry'

interface TemplateSelectorProps {
  selectedTemplateId: string
  onSelect: (template: LayoutTemplate) => void
  layouts: LayoutTemplate[]
}

export function TemplateSelector({
  selectedTemplateId,
  onSelect,
  layouts,
}: TemplateSelectorProps) {
  const [activeCount, setActiveCount] = useState<number | 'all'>('all')

  const counts = useMemo(
    () => Array.from(new Set(layouts.map((layout) => layout.zones.length))).sort((a, b) => a - b),
    [layouts]
  )

  const visibleLayouts = useMemo(() => {
    if (activeCount === 'all') return layouts
    return layouts.filter((layout) => layout.zones.length === activeCount)
  }, [activeCount, layouts])

  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">
          Nombre de photos
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCount('all')}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              activeCount === 'all'
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
            }`}
          >
            Toutes
          </button>
          {counts.map((count) => (
            <button
              key={count}
              onClick={() => setActiveCount(count)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                activeCount === count
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
              }`}
            >
              {count}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {visibleLayouts.map((template) => (
          <button
            key={template.id}
            onClick={() => onSelect(template)}
            className={`border-2 rounded-xl p-2 text-left transition-colors touch-manipulation ${
              template.id === selectedTemplateId
                ? 'border-primary-600 bg-primary-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <div className="w-full bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
              <div
                className="relative w-full"
                style={{ aspectRatio: `${template.aspectRatio}` }}
              >
                {template.zones.map((zone, index) => (
                  <div
                    key={`${template.id}-${index}`}
                    className="absolute border border-gray-400 bg-white/70"
                    style={{
                      left: `${zone.x}%`,
                      top: `${zone.y}%`,
                      width: `${zone.width}%`,
                      height: `${zone.height}%`,
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="mt-2">
              <div className="text-xs font-semibold text-gray-800 truncate">
                {template.name}
              </div>
              <div className="text-[11px] text-gray-500">
                {template.zones.length} photos
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
