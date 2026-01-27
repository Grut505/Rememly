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

const modules = import.meta.glob('./layouts/*.json', { eager: true })

const layouts = Object.values(modules).map((mod) => {
  const data = (mod as { default: Partial<LayoutTemplate> }).default || {}
  const id = data.id || ''
  return {
    id,
    name: data.name || id,
    aspectRatio: data.aspectRatio || 1,
    zones: data.zones || [],
    tags: data.tags || [],
  } satisfies LayoutTemplate
})

export const LAYOUTS: LayoutTemplate[] = layouts
  .filter((layout) => layout.id && layout.zones.length > 0)
  .sort((a, b) => {
    const countDiff = a.zones.length - b.zones.length
    if (countDiff !== 0) return countDiff
    return a.name.localeCompare(b.name)
  })

export const LAYOUTS_BY_COUNT = LAYOUTS.reduce((acc, layout) => {
  const count = layout.zones.length
  if (!acc.has(count)) acc.set(count, [])
  acc.get(count)!.push(layout)
  return acc
}, new Map<number, LayoutTemplate[]>())
