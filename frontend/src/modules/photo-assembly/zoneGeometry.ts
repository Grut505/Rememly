import { ZoneState } from '../../api/types'
import { LayoutZone } from './layoutRegistry'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const EPSILON = 0.5 // % tolerance for two zone edges to be considered "the same line"
export const MIN_ZONE_SIZE_PCT = 8

// The template's own zone, or the user's resized override for this instance.
export function getEffectiveRect(templateZone: LayoutZone, zoneState: ZoneState | undefined): Rect {
  if (zoneState?.rect) return zoneState.rect
  return { x: templateZone.x, y: templateZone.y, width: templateZone.width, height: templateZone.height }
}

export function getAllEffectiveRects(templateZones: LayoutZone[], zoneStates: ZoneState[]): Rect[] {
  return templateZones.map((zone, index) => getEffectiveRect(zone, zoneStates[index]))
}

export type ResizeEdge = 'left' | 'right' | 'top' | 'bottom'
export type ResizeMode = 'line' | 'block'

// How far a 'block' handle sits inset from the edge (into the selected
// zone), so it never overlaps the 'line' handle sitting right on the edge.
const BLOCK_HANDLE_INSET_PCT = 4

// How close a solo-resized ('block') edge needs to get to another zone's
// edge before it snaps into exact alignment with it.
export const SNAP_THRESHOLD_PCT = 1.5

export interface ResizeHandle {
  edge: ResizeEdge
  mode: ResizeMode
  // Canvas-space position (0-100 %) of the handle. The 'line' handle sits
  // at the midpoint of the shared edge; the 'block' handle sits at the same
  // midpoint but inset into the zone (see BLOCK_HANDLE_INSET_PCT).
  x: number
  y: number
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart) > EPSILON
}

function hasNeighborOn(rectsToCheck: Rect[], selectedRect: Rect, selectedIndex: number, edge: ResizeEdge) {
  return rectsToCheck.some((rect, i) => {
    if (i === selectedIndex) return false
    if (edge === 'left') {
      return Math.abs(rect.x + rect.width - selectedRect.x) < EPSILON && rangesOverlap(rect.y, rect.y + rect.height, selectedRect.y, selectedRect.y + selectedRect.height)
    }
    if (edge === 'right') {
      return Math.abs(rect.x - (selectedRect.x + selectedRect.width)) < EPSILON && rangesOverlap(rect.y, rect.y + rect.height, selectedRect.y, selectedRect.y + selectedRect.height)
    }
    if (edge === 'top') {
      return Math.abs(rect.y + rect.height - selectedRect.y) < EPSILON && rangesOverlap(rect.x, rect.x + rect.width, selectedRect.x, selectedRect.x + selectedRect.width)
    }
    return Math.abs(rect.y - (selectedRect.y + selectedRect.height)) < EPSILON && rangesOverlap(rect.x, rect.x + rect.width, selectedRect.x, selectedRect.x + selectedRect.width)
  })
}

// Handles only render on edges that have at least one neighboring zone
// touching them - there's nothing to drag on the outer border of the page.
//
// The 'line' handle needs a neighbor in the CURRENT (possibly block-resized)
// layout - dragging the whole line only makes sense while it's still a real
// shared border. The 'block' handle instead checks the ORIGINAL template
// layout (via templateRects, defaulting to `rects` for callers that don't
// pass one) - otherwise, once a block-resize moves an edge out of exact
// alignment, the neighbor check for BOTH handles would fail and the handles
// would vanish entirely, leaving the user no way to keep adjusting or snap
// it back (the reported bug). The template's structure doesn't change across
// a resize, so it stays a reliable source of "this edge is adjustable".
export function getResizeHandles(rects: Rect[], selectedIndex: number, templateRects: Rect[] = rects): ResizeHandle[] {
  const selected = rects[selectedIndex]
  const templateSelected = templateRects[selectedIndex]
  if (!selected || !templateSelected) return []
  const handles: ResizeHandle[] = []

  const midY = selected.y + selected.height / 2
  const midX = selected.x + selected.width / 2

  if (hasNeighborOn(rects, selected, selectedIndex, 'left')) {
    handles.push({ edge: 'left', mode: 'line', x: selected.x, y: midY })
  }
  if (hasNeighborOn(templateRects, templateSelected, selectedIndex, 'left')) {
    handles.push({ edge: 'left', mode: 'block', x: selected.x + BLOCK_HANDLE_INSET_PCT, y: midY })
  }
  if (hasNeighborOn(rects, selected, selectedIndex, 'right')) {
    handles.push({ edge: 'right', mode: 'line', x: selected.x + selected.width, y: midY })
  }
  if (hasNeighborOn(templateRects, templateSelected, selectedIndex, 'right')) {
    handles.push({ edge: 'right', mode: 'block', x: selected.x + selected.width - BLOCK_HANDLE_INSET_PCT, y: midY })
  }
  if (hasNeighborOn(rects, selected, selectedIndex, 'top')) {
    handles.push({ edge: 'top', mode: 'line', x: midX, y: selected.y })
  }
  if (hasNeighborOn(templateRects, templateSelected, selectedIndex, 'top')) {
    handles.push({ edge: 'top', mode: 'block', x: midX, y: selected.y + BLOCK_HANDLE_INSET_PCT })
  }
  if (hasNeighborOn(rects, selected, selectedIndex, 'bottom')) {
    handles.push({ edge: 'bottom', mode: 'line', x: midX, y: selected.y + selected.height })
  }
  if (hasNeighborOn(templateRects, templateSelected, selectedIndex, 'bottom')) {
    handles.push({ edge: 'bottom', mode: 'block', x: midX, y: selected.y + selected.height - BLOCK_HANDLE_INSET_PCT })
  }

  return handles
}

// Moves the shared edge line (the selected zone's `edge`) by `deltaPct` (%,
// canvas-space, positive = right/down). Every zone whose matching edge sits
// on that same line moves with it, so the layout never develops a gap or
// overlap. Returns a full replacement array of rects (same order/length as
// input) - callers persist each one back into its zone's state as an override.
export function resizeEdge(rects: Rect[], selectedIndex: number, edge: ResizeEdge, deltaPct: number): Rect[] {
  const selected = rects[selectedIndex]
  if (!selected) return rects

  const isVertical = edge === 'left' || edge === 'right'
  const lineValue = edge === 'left' ? selected.x
    : edge === 'right' ? selected.x + selected.width
    : edge === 'top' ? selected.y
    : selected.y + selected.height

  // A zone is "before" the line if the line is its right/bottom edge (moving
  // the line changes that zone's width/height by +delta); "after" if the line
  // is its left/top edge (moving the line changes x/y by +delta and
  // width/height by -delta). The selected zone always matches trivially.
  //
  // Deliberately NOT restricted to zones that overlap the selected zone's
  // perpendicular range: in a grid this same vertical/horizontal line is
  // shared by every row/column, not just the one the selected zone sits in
  // (e.g. dragging the divider between the top-left and top-right cells of a
  // 2x2 grid should move the bottom-left/bottom-right divider too, since
  // visually it's one continuous line) - any zone whose edge coincides with
  // the line is part of that same divider.
  const affected: Array<{ index: number; side: 'before' | 'after' }> = []
  rects.forEach((rect, i) => {
    if (isVertical) {
      if (Math.abs(rect.x + rect.width - lineValue) < EPSILON) affected.push({ index: i, side: 'before' })
      else if (Math.abs(rect.x - lineValue) < EPSILON) affected.push({ index: i, side: 'after' })
    } else {
      if (Math.abs(rect.y + rect.height - lineValue) < EPSILON) affected.push({ index: i, side: 'before' })
      else if (Math.abs(rect.y - lineValue) < EPSILON) affected.push({ index: i, side: 'after' })
    }
  })

  // Clamp so no affected zone would shrink below the minimum size.
  let clampedDelta = deltaPct
  for (const { index, side } of affected) {
    const rect = rects[index]
    const size = isVertical ? rect.width : rect.height
    if (side === 'before') {
      // new size = size + delta -> delta >= MIN - size
      clampedDelta = Math.max(clampedDelta, MIN_ZONE_SIZE_PCT - size)
    } else {
      // new size = size - delta -> delta <= size - MIN
      clampedDelta = Math.min(clampedDelta, size - MIN_ZONE_SIZE_PCT)
    }
  }

  if (clampedDelta === 0) return rects

  return rects.map((rect, i) => {
    const found = affected.find((a) => a.index === i)
    if (!found) return rect
    if (isVertical) {
      if (found.side === 'before') return { ...rect, width: rect.width + clampedDelta }
      return { ...rect, x: rect.x + clampedDelta, width: rect.width - clampedDelta }
    }
    if (found.side === 'before') return { ...rect, height: rect.height + clampedDelta }
    return { ...rect, y: rect.y + clampedDelta, height: rect.height - clampedDelta }
  })
}

// Looks for another zone's edge sitting within SNAP_THRESHOLD_PCT of
// `rawValue` - used while block-resizing to let a solo-moved edge snap back
// into alignment with a neighbor (or any other zone sharing that
// coordinate), so the layout can return to a clean shared line.
function findSnapTarget(rects: Rect[], selectedIndex: number, isVertical: boolean, rawValue: number): number | null {
  let best: number | null = null
  let bestDist = SNAP_THRESHOLD_PCT
  rects.forEach((rect, i) => {
    if (i === selectedIndex) return
    const candidates = isVertical ? [rect.x, rect.x + rect.width] : [rect.y, rect.y + rect.height]
    for (const candidate of candidates) {
      const dist = Math.abs(candidate - rawValue)
      if (dist < bestDist) {
        bestDist = dist
        best = candidate
      }
    }
  })
  return best
}

// Resizes ONLY the selected zone's own edge - unlike resizeEdge, no other
// zone is touched, so this can open a gap or overlap with whatever used to
// be a shared border. Snaps back into exact alignment with any other zone's
// matching edge once dragged within SNAP_THRESHOLD_PCT of it, so the layout
// can be restored to a clean shared line (letting resizeEdge take over
// again for that border, since it detects "shared" purely by coordinate
// equality).
export function resizeBlockEdge(rects: Rect[], selectedIndex: number, edge: ResizeEdge, deltaPct: number): Rect[] {
  const selected = rects[selectedIndex]
  if (!selected) return rects

  if (edge === 'left') {
    let newLeft = selected.x + deltaPct
    newLeft = Math.max(0, Math.min(newLeft, selected.x + selected.width - MIN_ZONE_SIZE_PCT))
    newLeft = findSnapTarget(rects, selectedIndex, true, newLeft) ?? newLeft
    if (newLeft === selected.x) return rects
    return rects.map((r, i) => (i === selectedIndex ? { ...r, x: newLeft, width: r.width + (r.x - newLeft) } : r))
  }
  if (edge === 'right') {
    let newRight = selected.x + selected.width + deltaPct
    newRight = Math.min(100, Math.max(newRight, selected.x + MIN_ZONE_SIZE_PCT))
    newRight = findSnapTarget(rects, selectedIndex, true, newRight) ?? newRight
    if (newRight === selected.x + selected.width) return rects
    return rects.map((r, i) => (i === selectedIndex ? { ...r, width: newRight - r.x } : r))
  }
  if (edge === 'top') {
    let newTop = selected.y + deltaPct
    newTop = Math.max(0, Math.min(newTop, selected.y + selected.height - MIN_ZONE_SIZE_PCT))
    newTop = findSnapTarget(rects, selectedIndex, false, newTop) ?? newTop
    if (newTop === selected.y) return rects
    return rects.map((r, i) => (i === selectedIndex ? { ...r, y: newTop, height: r.height + (r.y - newTop) } : r))
  }
  // bottom
  let newBottom = selected.y + selected.height + deltaPct
  newBottom = Math.min(100, Math.max(newBottom, selected.y + MIN_ZONE_SIZE_PCT))
  newBottom = findSnapTarget(rects, selectedIndex, false, newBottom) ?? newBottom
  if (newBottom === selected.y + selected.height) return rects
  return rects.map((r, i) => (i === selectedIndex ? { ...r, height: newBottom - r.y } : r))
}
