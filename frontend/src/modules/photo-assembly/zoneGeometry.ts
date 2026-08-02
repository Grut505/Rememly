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

export interface ResizeHandle {
  edge: ResizeEdge
  // Canvas-space position (0-100 %) of the handle, at the midpoint of the
  // selected zone's edge.
  x: number
  y: number
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart) > EPSILON
}

// Handles only render on edges that have at least one neighboring zone
// touching them - there's nothing to drag on the outer border of the page.
export function getResizeHandles(rects: Rect[], selectedIndex: number): ResizeHandle[] {
  const selected = rects[selectedIndex]
  if (!selected) return []
  const handles: ResizeHandle[] = []

  const hasNeighborOn = (edge: ResizeEdge) => {
    return rects.some((rect, i) => {
      if (i === selectedIndex) return false
      if (edge === 'left') {
        return Math.abs(rect.x + rect.width - selected.x) < EPSILON && rangesOverlap(rect.y, rect.y + rect.height, selected.y, selected.y + selected.height)
      }
      if (edge === 'right') {
        return Math.abs(rect.x - (selected.x + selected.width)) < EPSILON && rangesOverlap(rect.y, rect.y + rect.height, selected.y, selected.y + selected.height)
      }
      if (edge === 'top') {
        return Math.abs(rect.y + rect.height - selected.y) < EPSILON && rangesOverlap(rect.x, rect.x + rect.width, selected.x, selected.x + selected.width)
      }
      return Math.abs(rect.y - (selected.y + selected.height)) < EPSILON && rangesOverlap(rect.x, rect.x + rect.width, selected.x, selected.x + selected.width)
    })
  }

  if (hasNeighborOn('left')) handles.push({ edge: 'left', x: selected.x, y: selected.y + selected.height / 2 })
  if (hasNeighborOn('right')) handles.push({ edge: 'right', x: selected.x + selected.width, y: selected.y + selected.height / 2 })
  if (hasNeighborOn('top')) handles.push({ edge: 'top', x: selected.x + selected.width / 2, y: selected.y })
  if (hasNeighborOn('bottom')) handles.push({ edge: 'bottom', x: selected.x + selected.width / 2, y: selected.y + selected.height })

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
