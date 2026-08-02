import defaultLayoutData from './layouts/grid-1x1-1x1.json'
import { LAYOUT_INDEX } from './layoutIndex'

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
// synchronously on mount.
export const DEFAULT_LAYOUT: LayoutTemplate = normalize(defaultLayoutData as Partial<LayoutTemplate>)

// Non-eager: each matched file becomes its own dynamic import instead of
// being inlined into whichever chunk imports this module. With 4000+
// layouts, even lazily loading ALL of them (as this used to do) means
// thousands of dynamic imports every time the picker opens - LAYOUT_INDEX
// (ratio/count only, no geometry, cheap enough to bundle eagerly) lets
// callers filter down to the handful of files that actually match a given
// orientation/ratio/photo-count combination BEFORE importing anything.
const lazyModules = import.meta.glob('./layouts/*.json') as Record<string, () => Promise<{ default: Partial<LayoutTemplate> }>>

// Every distinct photo count that has at least one layout - for populating
// the "Photos" filter.
export const AVAILABLE_COUNTS: number[] = Array.from(new Set(LAYOUT_INDEX.map((e) => e.count))).sort((a, b) => a - b)

// Every distinct ratio label (optionally narrowed to a given orientation
// bucket) - for populating the "Ratio" filter.
export function availableRatios(): string[] {
  return Array.from(new Set(LAYOUT_INDEX.map((e) => e.ratio)))
}

export function aspectRatioForLabel(ratio: string): number {
  const entry = LAYOUT_INDEX.find((e) => e.ratio === ratio)
  return entry ? entry.aspectRatio : 1
}

const cache = new Map<string, LayoutTemplate>()

/** Loads only the layouts matching an exact photo count + ratio label -
 * orientation/"all" filtering happens one level up, on the ratio label
 * itself, since every ratio label maps to exactly one orientation. */
export async function loadLayoutsFor(count: number, ratio: string): Promise<LayoutTemplate[]> {
  const matches = LAYOUT_INDEX.filter((e) => e.count === count && e.ratio === ratio)
  const results = await Promise.all(
    matches.map(async (entry) => {
      const cached = cache.get(entry.path)
      if (cached) return cached
      const loader = lazyModules[entry.path]
      if (!loader) return null
      const mod = await loader()
      const layout = normalize(mod.default || {})
      cache.set(entry.path, layout)
      return layout
    })
  )
  return results
    .filter((layout): layout is LayoutTemplate => !!layout && !!layout.id && layout.zones.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
}
