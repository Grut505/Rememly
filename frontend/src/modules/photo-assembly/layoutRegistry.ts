import defaultLayoutData from './layouts/grid-1x1-1x1.json'

export interface LayoutZone {
  x: number
  y: number
  width: number
  height: number
}

export interface LayoutTemplate {
  id: string
  name: string
  aspectRatio: number
  zones: LayoutZone[]
  tags?: string[]
}

function normalize(data: Partial<LayoutTemplate>): LayoutTemplate {
  const id = data.id || ''
  return {
    id,
    name: data.name || id,
    aspectRatio: data.aspectRatio || 1,
    zones: data.zones || [],
    tags: data.tags || [],
  }
}

// A single, tiny layout imported eagerly (bundled directly, no extra
// request) so the Assembly screen always has something to render
// synchronously on mount - every other layout (400+ files, growing) loads
// lazily via loadAllLayouts() only once the layout picker is actually
// opened, instead of parsing the whole registry just to view/edit an
// already-assembled photo.
export const DEFAULT_LAYOUT: LayoutTemplate = normalize(defaultLayoutData as Partial<LayoutTemplate>)

// Non-eager: each matched file becomes its own dynamic import instead of
// being inlined into whichever chunk imports this module.
const lazyModules = import.meta.glob('./layouts/*.json') as Record<string, () => Promise<{ default: Partial<LayoutTemplate> }>>

let cachedLayouts: LayoutTemplate[] | null = null
let inFlight: Promise<LayoutTemplate[]> | null = null

export async function loadAllLayouts(): Promise<LayoutTemplate[]> {
  if (cachedLayouts) return cachedLayouts
  if (inFlight) return inFlight

  inFlight = Promise.all(Object.values(lazyModules).map((load) => load()))
    .then((modules) => {
      const layouts = modules
        .map((mod) => normalize(mod.default || {}))
        .filter((layout) => layout.id && layout.zones.length > 0)
        .sort((a, b) => {
          const countDiff = a.zones.length - b.zones.length
          if (countDiff !== 0) return countDiff
          return a.name.localeCompare(b.name)
        })
      cachedLayouts = layouts
      return layouts
    })
    .finally(() => {
      inFlight = null
    })

  return inFlight
}
