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
  const [activeRatio, setActiveRatio] = useState<string | 'all'>('all')

  const ratioPresets = [
    { label: '1:1', value: 1 },
    { label: '1:1.44', value: 1 / 1.44 },
    { label: '1:0.54', value: 1 / 0.54 },
    { label: '4:3', value: 4 / 3 },
    { label: '3:4', value: 3 / 4 },
    { label: '16:9', value: 16 / 9 },
    { label: '9:16', value: 9 / 16 },
    { label: '3:2', value: 3 / 2 },
    { label: '2:3', value: 2 / 3 },
  ]

  const getRatioLabel = (ratio: number) => {
    const preset = ratioPresets.find((item) => Math.abs(item.value - ratio) < 0.01)
    return preset ? preset.label : ratio.toFixed(2)
  }

  const counts = useMemo(
    () => Array.from(new Set(layouts.map((layout) => layout.zones.length))).sort((a, b) => a - b),
    [layouts]
  )

  const ratios = useMemo(() => {
    const labels = Array.from(new Set(layouts.map((layout) => getRatioLabel(layout.aspectRatio))))
    const presetOrder = ratioPresets.map((preset) => preset.label)
    return labels.sort((a, b) => {
      const aIndex = presetOrder.indexOf(a)
      const bIndex = presetOrder.indexOf(b)
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b)
      if (aIndex === -1) return 1
      if (bIndex === -1) return -1
      return aIndex - bIndex
    })
  }, [layouts])

  const visibleLayouts = useMemo(() => {
    return layouts.filter((layout) => {
      const countMatch = activeCount === 'all' || layout.zones.length === activeCount
      const ratioMatch = activeRatio === 'all' || getRatioLabel(layout.aspectRatio) === activeRatio
      return countMatch && ratioMatch
    })
  }, [activeCount, activeRatio, layouts])

  return (
    <div className="p-4 flex flex-col gap-4 h-[70vh] sm:h-[70vh]">
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">
          Ratio
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveRatio('all')}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              activeRatio === 'all'
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
            }`}
          >
            Tous
          </button>
          {ratios.map((ratio) => (
            <button
              key={ratio}
              onClick={() => setActiveRatio(ratio)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                activeRatio === ratio
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
              }`}
            >
              {ratio}
            </button>
          ))}
        </div>
      </div>

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

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-y-auto pr-1 flex-1">
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
