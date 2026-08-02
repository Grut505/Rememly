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
  const [activeOrientation, setActiveOrientation] = useState<'landscape' | 'portrait' | 'square' | 'all'>('all')

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

  // 1:1.44 and 1:0.54 are the two aspect ratios Famileo accepts for postcards
  const FAMILEO_RATIO_LABELS = ['1:1.44', '1:0.54']
  const isFamileoRatio = (ratio: number) => FAMILEO_RATIO_LABELS.includes(getRatioLabel(ratio))

  const getOrientation = (ratio: number): 'landscape' | 'portrait' | 'square' => {
    if (ratio > 1.05) return 'landscape'
    if (ratio < 0.95) return 'portrait'
    return 'square'
  }

  const counts = useMemo(
    () => Array.from(new Set(layouts.map((layout) => layout.zones.length))).sort((a, b) => a - b),
    [layouts]
  )

  const ratios = useMemo(() => {
    const relevant = activeOrientation === 'all'
      ? layouts
      : layouts.filter((layout) => getOrientation(layout.aspectRatio) === activeOrientation)
    const labels = Array.from(new Set(relevant.map((layout) => getRatioLabel(layout.aspectRatio))))
    const presetOrder = ratioPresets.map((preset) => preset.label)
    return labels.sort((a, b) => {
      const aIndex = presetOrder.indexOf(a)
      const bIndex = presetOrder.indexOf(b)
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b)
      if (aIndex === -1) return 1
      if (bIndex === -1) return -1
      return aIndex - bIndex
    })
  }, [layouts, activeOrientation])

  const handleOrientationChange = (orientation: typeof activeOrientation) => {
    setActiveOrientation(orientation)
    // Drop a specific ratio selection that no longer matches the chosen
    // orientation, rather than silently showing an empty grid.
    if (activeRatio !== 'all' && orientation !== 'all') {
      const preset = ratioPresets.find((p) => p.label === activeRatio)
      if (!preset || getOrientation(preset.value) !== orientation) {
        setActiveRatio('all')
      }
    }
  }

  const visibleLayouts = useMemo(() => {
    return layouts.filter((layout) => {
      const countMatch = activeCount === 'all' || layout.zones.length === activeCount
      const ratioMatch = activeRatio === 'all' || getRatioLabel(layout.aspectRatio) === activeRatio
      const orientationMatch = activeOrientation === 'all' || getOrientation(layout.aspectRatio) === activeOrientation
      return countMatch && ratioMatch && orientationMatch
    })
  }, [activeCount, activeRatio, activeOrientation, layouts])

  const orientationOptions: Array<{ value: typeof activeOrientation; label: string }> = [
    { value: 'all', label: 'Toutes' },
    { value: 'landscape', label: 'Paysage' },
    { value: 'portrait', label: 'Portrait' },
    { value: 'square', label: 'Carré' },
  ]

  return (
    <div className="p-4 flex flex-col gap-3 h-[70vh] sm:h-[70vh]">
      <div>
        <h3 className="text-xs font-medium text-gray-700 mb-1.5">
          Orientation
        </h3>
        <div className="flex gap-1.5 overflow-x-auto flex-nowrap pb-0.5 -mx-1 px-1">
          {orientationOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => handleOrientationChange(option.value)}
              className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs border transition-colors ${
                activeOrientation === option.value
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-medium text-gray-700 mb-1.5">
          Ratio
        </h3>
        <div className="flex gap-1.5 overflow-x-auto flex-nowrap pb-0.5 -mx-1 px-1">
          <button
            onClick={() => setActiveRatio('all')}
            className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs border transition-colors ${
              activeRatio === 'all'
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
            }`}
          >
            Tous
          </button>
          {ratios.map((ratio) => {
            const famileo = FAMILEO_RATIO_LABELS.includes(ratio)
            return (
              <button
                key={ratio}
                onClick={() => setActiveRatio(ratio)}
                title={famileo ? 'Compatible Famileo postcard format' : undefined}
                className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs border transition-colors flex items-center gap-1 ${
                  activeRatio === ratio
                    ? 'bg-primary-600 text-white border-primary-600'
                    : famileo
                    ? 'bg-purple-50 text-purple-700 border-purple-300 hover:border-purple-400'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                }`}
              >
                {ratio}
                {famileo && <span aria-hidden="true">✉️</span>}
              </button>
            )
          })}
        </div>
        {ratios.some((ratio) => FAMILEO_RATIO_LABELS.includes(ratio)) && (
          <p className="text-xs text-purple-700 mt-1 flex items-center gap-1">
            <span aria-hidden="true">✉️</span> Famileo-compatible postcard formats
          </p>
        )}
      </div>

      <div>
        <h3 className="text-xs font-medium text-gray-700 mb-1.5">
          Nombre de photos
        </h3>
        <div className="flex gap-1.5 overflow-x-auto flex-nowrap pb-0.5 -mx-1 px-1">
          <button
            onClick={() => setActiveCount('all')}
            className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs border transition-colors ${
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
              className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs border transition-colors ${
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
        {visibleLayouts.map((template) => {
          const famileo = isFamileoRatio(template.aspectRatio)
          return (
            <button
              key={template.id}
              onClick={() => onSelect(template)}
              className={`border-2 rounded-xl p-2 text-left transition-colors touch-manipulation relative ${
                template.id === selectedTemplateId
                  ? 'border-primary-600 bg-primary-50'
                  : famileo
                  ? 'border-purple-300 bg-purple-50/40 hover:border-purple-400'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              {famileo && (
                <span
                  className="absolute top-1 right-1 z-10 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-medium"
                  title="Compatible Famileo postcard format"
                >
                  ✉️ Famileo
                </span>
              )}
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
          )
        })}
      </div>
    </div>
  )
}
