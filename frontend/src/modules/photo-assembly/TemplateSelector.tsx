import { useEffect, useMemo, useState } from 'react'
import { LayoutTemplate, loadLayoutsFor, AVAILABLE_COUNTS, availableRatios, aspectRatioForLabel } from './layoutRegistry'

interface TemplateSelectorProps {
  selectedTemplateId: string
  onSelect: (template: LayoutTemplate) => void
}

type Orientation = 'landscape' | 'portrait' | 'square'

// Maps the file-name-style ratio keys used by layoutIndex (e.g. "16x9") to
// their human-readable display label (e.g. "16:9"), in the order they
// should appear in the Ratio filter.
const RATIO_DISPLAY: Array<{ key: string; label: string }> = [
  { key: '1x1', label: '1:1' },
  { key: '1x1.44', label: '1:1.44' },
  { key: '1x0.54', label: '1:0.54' },
  { key: '4x3', label: '4:3' },
  { key: '3x4', label: '3:4' },
  { key: '4x5', label: '4:5' },
  { key: '16x9', label: '16:9' },
  { key: '9x16', label: '9:16' },
  { key: '3x2', label: '3:2' },
  { key: '2x3', label: '2:3' },
]

// 1:1.44 and 1:0.54 are the two aspect ratios Famileo accepts for postcards
const FAMILEO_RATIO_KEYS = ['1x1.44', '1x0.54']

const getOrientation = (ratio: number): Orientation => {
  if (ratio > 1.05) return 'landscape'
  if (ratio < 0.95) return 'portrait'
  return 'square'
}

export function TemplateSelector({
  selectedTemplateId,
  onSelect,
}: TemplateSelectorProps) {
  const [layouts, setLayouts] = useState<LayoutTemplate[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeCount, setActiveCount] = useState<number | null>(null)
  const [activeRatio, setActiveRatio] = useState<string | null>(null)
  const [activeOrientation, setActiveOrientation] = useState<Orientation | null>(null)
  const [filtersExpanded, setFiltersExpanded] = useState(true)

  const allRatioKeys = useMemo(() => availableRatios(), [])

  const ratioKeysForOrientation = useMemo(() => {
    if (!activeOrientation) return []
    return RATIO_DISPLAY
      .filter((entry) => allRatioKeys.includes(entry.key))
      .filter((entry) => getOrientation(aspectRatioForLabel(entry.key)) === activeOrientation)
  }, [allRatioKeys, activeOrientation])

  const handleOrientationChange = (orientation: Orientation) => {
    setActiveOrientation((prev) => (prev === orientation ? null : orientation))
    // Drop a ratio selection that no longer matches the newly chosen
    // orientation, rather than silently keeping a mismatched filter.
    if (activeRatio && getOrientation(aspectRatioForLabel(activeRatio)) !== orientation) {
      setActiveRatio(null)
    }
  }

  useEffect(() => {
    if (!activeCount || !activeRatio) {
      setLayouts(null)
      return
    }
    let cancelled = false
    setLoading(true)
    loadLayoutsFor(activeCount, activeRatio).then((loaded) => {
      if (!cancelled) {
        setLayouts(loaded)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [activeCount, activeRatio])

  return (
    <div className="p-4 flex flex-col gap-2 h-[70vh] sm:h-[70vh]">
      <button
        type="button"
        onClick={() => setFiltersExpanded((prev) => !prev)}
        className="flex items-center justify-between text-xs font-medium text-gray-700 py-1"
      >
        Filtres
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${filtersExpanded ? 'rotate-180' : ''}`}
          fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path d="M19 9l-7 7-7-7"></path>
        </svg>
      </button>

      {filtersExpanded && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h3 className="flex-shrink-0 w-20 text-xs font-medium text-gray-700">
              Orientation
            </h3>
            <div className="flex-1 min-w-0 flex gap-1.5 overflow-x-auto flex-nowrap pb-0.5">
              {([
                { value: 'landscape' as const, label: 'Paysage' },
                { value: 'portrait' as const, label: 'Portrait' },
                { value: 'square' as const, label: 'Carré' },
              ]).map((option) => (
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

          <div className="flex items-center gap-2">
            <h3 className="flex-shrink-0 w-20 text-xs font-medium text-gray-700">
              Ratio
            </h3>
            <div className="flex-1 min-w-0 flex gap-1.5 overflow-x-auto flex-nowrap pb-0.5">
              {!activeOrientation && (
                <span className="text-xs text-gray-400 italic py-1">Choisissez d'abord une orientation</span>
              )}
              {ratioKeysForOrientation.map(({ key, label }) => {
                const famileo = FAMILEO_RATIO_KEYS.includes(key)
                return (
                  <button
                    key={key}
                    onClick={() => setActiveRatio((prev) => (prev === key ? null : key))}
                    title={famileo ? 'Compatible Famileo postcard format' : undefined}
                    className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs border transition-colors flex items-center gap-1 ${
                      activeRatio === key
                        ? 'bg-primary-600 text-white border-primary-600'
                        : famileo
                        ? 'bg-purple-50 text-purple-700 border-purple-300 hover:border-purple-400'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {label}
                    {famileo && <span aria-hidden="true">✉️</span>}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <h3 className="flex-shrink-0 w-20 text-xs font-medium text-gray-700">
              Photos
            </h3>
            <div className="flex-1 min-w-0 flex gap-1.5 overflow-x-auto flex-nowrap pb-0.5">
              {AVAILABLE_COUNTS.map((count) => (
                <button
                  key={count}
                  onClick={() => setActiveCount((prev) => (prev === count ? null : count))}
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
        </div>
      )}

      {(!activeOrientation || !activeRatio || !activeCount) && (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500 text-center px-4">
          {!activeOrientation
            ? 'Sélectionnez une orientation, un ratio et un nombre de photos pour afficher les mises en page.'
            : !activeRatio
            ? 'Sélectionnez un ratio.'
            : 'Sélectionnez un nombre de photos.'}
        </div>
      )}

      {activeOrientation && activeRatio && activeCount && loading && (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
          Chargement des mises en page...
        </div>
      )}

      {activeOrientation && activeRatio && activeCount && !loading && layouts && (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 overflow-y-auto pr-1 flex-1 content-start">
          {layouts.map((template) => {
            const famileo = FAMILEO_RATIO_KEYS.includes(activeRatio)
            return (
              <button
                key={template.id}
                onClick={() => onSelect(template)}
                title={template.name}
                className={`border-2 rounded-lg p-1 transition-colors touch-manipulation relative ${
                  template.id === selectedTemplateId
                    ? 'border-primary-600 bg-primary-50'
                    : famileo
                    ? 'border-purple-300 bg-purple-50/40 hover:border-purple-400'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                {famileo && (
                  <span
                    className="absolute top-0.5 right-0.5 z-10 text-[9px]"
                    title="Compatible Famileo postcard format"
                    aria-hidden="true"
                  >
                    ✉️
                  </span>
                )}
                <div className="w-full bg-gray-100 rounded overflow-hidden border border-gray-200">
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
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
