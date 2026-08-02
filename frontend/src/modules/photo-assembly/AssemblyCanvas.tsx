import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react'
import { LayoutTemplate } from './layoutRegistry'
import { StateManager } from './StateManager'
import { CONSTANTS } from '../../utils/constants'
import { getAllEffectiveRects, getResizeHandles, resizeEdge, resizeBlockEdge, Rect, ResizeEdge, ResizeMode } from './zoneGeometry'

interface AssemblyCanvasProps {
  template: LayoutTemplate
  stateManager: StateManager
  selectedZoneIndex: number | null
  onZoneSelect: (zoneIndex: number) => void
  onZoneDoubleClick?: (zoneIndex: number) => void
  onStateChange: () => void
  stateVersion: number
  separatorWidth: number
  showOuterBorder?: boolean
  minZoom?: number
  maxZoom?: number
  maxHeightClassName?: string
}

export interface AssemblyCanvasHandle {
  // Re-renders every zone from its original full-resolution File (decoded
  // and closed one at a time, not the cached low-res in-editor bitmaps) so
  // the exported image isn't limited to ASSEMBLY_IMAGE_MAX_DIM_PX quality.
  renderFullResolution: () => Promise<HTMLCanvasElement>
}

export const AssemblyCanvas = forwardRef<AssemblyCanvasHandle, AssemblyCanvasProps>(function AssemblyCanvas({
  template,
  stateManager,
  selectedZoneIndex,
  onZoneSelect,
  onZoneDoubleClick,
  onStateChange,
  stateVersion,
  separatorWidth,
  showOuterBorder = true,
  minZoom = 0.5,
  maxZoom = 5,
  maxHeightClassName = 'max-h-[55vh]',
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // naturalWidth/naturalHeight are the ORIGINAL (pre-downscale) photo
  // dimensions - zoom values (zoneState.zoom, set by the "fit zone" actions
  // in PhotoAssembly.tsx from the photo's true size) are always relative to
  // these, never to source's own (possibly downscaled, see loadImages)
  // pixel dimensions. Drawing at `source`'s own size * zoom would under-fill
  // the zone once source is downscaled for memory - keeping the natural
  // size next to the source decouples "what resolution is decoded" from
  // "what size this draws at".
  const [images, setImages] = useState<Map<number, { source: CanvasImageSource; naturalWidth: number; naturalHeight: number }>>(new Map())
  const imageCacheRef = useRef<Map<File, { source: CanvasImageSource; naturalWidth: number; naturalHeight: number }>>(new Map())
  const lastPhotosKeyRef = useRef<string>('')
  const activeZoneRef = useRef<number | null>(null)
  const lastClickRef = useRef<{ time: number; zone: number | null }>({ time: 0, zone: null })
  const moveCandidateRef = useRef<{
    zoneIndex: number
    start: { x: number; y: number }
    moved: boolean
  } | null>(null)
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const gestureRef = useRef({
    startX: 0,
    startY: 0,
    startZoom: 1,
    startDist: 0,
    startCenter: { x: 0, y: 0 },
  })
  const resizeRef = useRef<{
    edge: ResizeEdge
    mode: ResizeMode
    zoneIndex: number
    startPoint: { x: number; y: number }
    startRects: Rect[]
  } | null>(null)
  const swapRef = useRef<{
    timer: number | null
    fromZone: number | null
    targetZone: number | null
    startPoint: { x: number; y: number } | null
    isSwapMode: boolean
  }>({
    timer: null,
    fromZone: null,
    targetZone: null,
    startPoint: null,
    isSwapMode: false,
  })

  useEffect(() => {
    loadImages()
  }, [stateManager, stateVersion])

  useEffect(() => {
    drawCanvas()
  }, [template, images, stateVersion, selectedZoneIndex, separatorWidth, showOuterBorder])

  const loadImages = async () => {
    const newImages = new Map<number, { source: CanvasImageSource; naturalWidth: number; naturalHeight: number }>()
    const state = stateManager.getState()
    const photosKey = state.photos.map((file) => `${file.name}-${file.size}-${file.lastModified}`).join('|')
    if (photosKey === lastPhotosKeyRef.current) {
      return
    }
    lastPhotosKeyRef.current = photosKey

    for (let i = 0; i < state.photos.length; i++) {
      const file = state.photos[i]

      let entry = imageCacheRef.current.get(file)
      if (!entry) {
        if (typeof createImageBitmap === 'function') {
          try {
            // Decoding at the original camera resolution (often 4000-8000px
            // on a modern phone) and keeping every zone's bitmap cached for
            // the component's lifetime is what was crashing iOS PWAs with
            // ~16 photos loaded at once - iOS silently kills the WKWebView
            // under memory pressure and reloads it, which looks like the
            // assembly "resetting" to its default template. Decode once at
            // full size just long enough to downscale, then close it - but
            // keep the ORIGINAL dimensions (naturalWidth/Height) around,
            // since zoom values are always relative to those, not to
            // whatever resolution the cached bitmap ends up at.
            const fullBitmap = await createImageBitmap(file)
            const naturalWidth = fullBitmap.width
            const naturalHeight = fullBitmap.height
            const maxDim = CONSTANTS.ASSEMBLY_IMAGE_MAX_DIM_PX
            let source: CanvasImageSource
            if (naturalWidth > maxDim || naturalHeight > maxDim) {
              const scale = maxDim / Math.max(naturalWidth, naturalHeight)
              source = await createImageBitmap(fullBitmap, {
                resizeWidth: Math.round(naturalWidth * scale),
                resizeHeight: Math.round(naturalHeight * scale),
                resizeQuality: 'medium',
              })
              fullBitmap.close()
            } else {
              source = fullBitmap
            }
            entry = { source, naturalWidth, naturalHeight }
            imageCacheRef.current.set(file, entry)
          } catch (error) {
            entry = undefined
          }
        }

        if (!entry) {
          const htmlImg = new Image()
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result || ''))
            reader.onerror = () => reject(new Error('read'))
            reader.readAsDataURL(file)
          }).catch(() => '')
          await new Promise<void>((resolve) => {
            htmlImg.onload = () => resolve()
            htmlImg.onerror = () => resolve()
            htmlImg.src = dataUrl
          })
          if (!htmlImg.naturalWidth || !htmlImg.naturalHeight) {
            continue
          }
          entry = { source: htmlImg, naturalWidth: htmlImg.naturalWidth, naturalHeight: htmlImg.naturalHeight }
          imageCacheRef.current.set(file, entry)
        }
      }
      newImages.set(i, entry)
    }

    // Evict cached bitmaps for photos no longer placed in any zone (e.g.
    // swapped out), instead of letting the cache grow for the whole session.
    const currentFiles = new Set(state.photos)
    for (const [cachedFile, cachedEntry] of imageCacheRef.current) {
      if (!currentFiles.has(cachedFile)) {
        if (cachedEntry.source && typeof (cachedEntry.source as ImageBitmap).close === 'function') {
          ;(cachedEntry.source as ImageBitmap).close()
        }
        imageCacheRef.current.delete(cachedFile)
      }
    }

    setImages(newImages)

  }

  useEffect(() => {
    return () => {
      for (const entry of imageCacheRef.current.values()) {
        if (entry.source && typeof (entry.source as ImageBitmap).close === 'function') {
          ;(entry.source as ImageBitmap).close()
        }
      }
      imageCacheRef.current.clear()
    }
  }, [])

  const drawCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    // The canvas is rendered at a fixed high internal resolution (for the
    // final exported image) but displayed much smaller on screen - a stroke
    // width specified in canvas units becomes a fraction of a real pixel
    // once scaled down, making editing-only indicators (selection, swap)
    // invisible. This converts a desired on-screen pixel size to canvas
    // units so they stay visible regardless of viewport size.
    const editScale = width / (canvas.clientWidth || width)

    ctx.fillStyle = '#f3f4f6'
    ctx.fillRect(0, 0, width, height)

    const state = stateManager.getState()
    const effectiveRects = getAllEffectiveRects(template.zones, state.zoneStates)

    template.zones.forEach((_zone, index) => {
      const zoneState = state.zoneStates[index]
      const img = images.get(zoneState.photoIndex)
      const rect = effectiveRects[index]

      const zoneX = (rect.x / 100) * width
      const zoneY = (rect.y / 100) * height
      const zoneWidth = (rect.width / 100) * width
      const zoneHeight = (rect.height / 100) * height

      ctx.fillStyle = index === selectedZoneIndex ? 'rgba(37, 99, 235, 0.18)' : 'rgba(255, 255, 255, 0.6)'
      ctx.fillRect(zoneX, zoneY, zoneWidth, zoneHeight)

      if (img) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(zoneX, zoneY, zoneWidth, zoneHeight)
        ctx.clip()

        const scale = zoneState.zoom
        // Always scale relative to the photo's natural (pre-downscale) size,
        // never img.source's own pixel dimensions - see the imageCacheRef
        // comment above for why those can differ.
        const imgWidth = img.naturalWidth * scale
        const imgHeight = img.naturalHeight * scale
        const centerX = zoneX + zoneWidth / 2 + zoneState.x
        const centerY = zoneY + zoneHeight / 2 + zoneState.y
        const rotation = (zoneState.rotation || 0) * (Math.PI / 180)

        ctx.translate(centerX, centerY)
        ctx.rotate(rotation)
        ctx.drawImage(img.source, -imgWidth / 2, -imgHeight / 2, imgWidth, imgHeight)
        ctx.restore()
      } else {
        // Empty-zone placeholder fill sits on top of the selection tint above,
        // so it needs its own selected variant or the highlight disappears.
        ctx.fillStyle = index === selectedZoneIndex ? '#bfdbfe' : '#e5e7eb'
        ctx.fillRect(zoneX + 2, zoneY + 2, zoneWidth - 4, zoneHeight - 4)
        ctx.fillStyle = index === selectedZoneIndex ? '#1d4ed8' : '#9ca3af'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.font = '14px sans-serif'
        ctx.fillText('+', zoneX + zoneWidth / 2, zoneY + zoneHeight / 2)
      }

      // Drawn after the photo/placeholder fill so the selection highlight is
      // never covered by it (previously only the empty-zone case kept it visible).
      ctx.strokeStyle = index === selectedZoneIndex ? '#2563eb' : '#ffffff'
      ctx.lineWidth = index === selectedZoneIndex ? Math.max(separatorWidth + 2, 3 * editScale) : Math.max(1, separatorWidth)
      if (showOuterBorder) {
        ctx.strokeRect(zoneX, zoneY, zoneWidth, zoneHeight)
      } else {
        // Outer border hidden: only stroke the edges that aren't on the
        // page's outer boundary (drawing each side separately, since
        // strokeRect can't selectively skip a side).
        const edgeEpsilon = 0.5
        const onLeftEdge = rect.x < edgeEpsilon
        const onRightEdge = rect.x + rect.width > 100 - edgeEpsilon
        const onTopEdge = rect.y < edgeEpsilon
        const onBottomEdge = rect.y + rect.height > 100 - edgeEpsilon
        ctx.beginPath()
        if (!onTopEdge) { ctx.moveTo(zoneX, zoneY); ctx.lineTo(zoneX + zoneWidth, zoneY) }
        if (!onRightEdge) { ctx.moveTo(zoneX + zoneWidth, zoneY); ctx.lineTo(zoneX + zoneWidth, zoneY + zoneHeight) }
        if (!onBottomEdge) { ctx.moveTo(zoneX + zoneWidth, zoneY + zoneHeight); ctx.lineTo(zoneX, zoneY + zoneHeight) }
        if (!onLeftEdge) { ctx.moveTo(zoneX, zoneY + zoneHeight); ctx.lineTo(zoneX, zoneY) }
        ctx.stroke()
      }

      ctx.fillStyle = index === selectedZoneIndex ? '#1d4ed8' : '#6b7280'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(`${index + 1}`, zoneX + 6, zoneY + 6)
    })

    const swap = swapRef.current
    if (swap.isSwapMode && swap.fromZone !== null) {
      const rect = effectiveRects[swap.fromZone]
      const zoneX = (rect.x / 100) * width
      const zoneY = (rect.y / 100) * height
      const zoneWidth = (rect.width / 100) * width
      const zoneHeight = (rect.height / 100) * height
      ctx.save()
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 4 * editScale
      ctx.setLineDash([14 * editScale, 8 * editScale])
      ctx.strokeRect(zoneX, zoneY, zoneWidth, zoneHeight)
      ctx.restore()
    }

    const swapTarget = swap.targetZone
    if (swapTarget !== null && swapTarget >= 0) {
      const rect = effectiveRects[swapTarget]
      const zoneX = (rect.x / 100) * width
      const zoneY = (rect.y / 100) * height
      const zoneWidth = (rect.width / 100) * width
      const zoneHeight = (rect.height / 100) * height
      ctx.strokeStyle = '#10b981'
      ctx.lineWidth = 4 * editScale
      ctx.strokeRect(zoneX, zoneY, zoneWidth, zoneHeight)
    }

    // Resize handles - two per shared edge of the selected zone: a 'line'
    // handle right on the border (drags every zone sharing that line, like
    // before) and a smaller 'block' handle inset into the zone (resizes
    // only this zone, which can open a gap/overlap - see resizeBlockEdge).
    // Skipped in swap mode (long-press) so the two gestures never fight
    // over the same drag.
    if (selectedZoneIndex !== null && !swap.isSwapMode) {
      const handles = getResizeHandles(effectiveRects, selectedZoneIndex, template.zones)
      const lineHandleSize = 18 * editScale
      const blockHandleSize = 12 * editScale
      handles.forEach((handle) => {
        const hx = (handle.x / 100) * width
        const hy = (handle.y / 100) * height
        const isLine = handle.mode === 'line'
        ctx.save()
        ctx.fillStyle = isLine ? '#2563eb' : '#f97316'
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2 * editScale
        ctx.beginPath()
        ctx.arc(hx, hy, (isLine ? lineHandleSize : blockHandleSize) / 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.restore()
      })
    }
  }

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height
    return { x, y }
  }

  const getEffectiveRects = () => getAllEffectiveRects(template.zones, stateManager.getState().zoneStates)

  const hitTestZone = (point: { x: number; y: number }, rects?: Rect[]) => {
    const canvas = canvasRef.current
    if (!canvas) return -1
    const width = canvas.width
    const height = canvas.height
    const list = rects || getEffectiveRects()
    return list.findIndex((rect) => {
      const zoneX = (rect.x / 100) * width
      const zoneY = (rect.y / 100) * height
      const zoneWidth = (rect.width / 100) * width
      const zoneHeight = (rect.height / 100) * height
      return (
        point.x >= zoneX &&
        point.x <= zoneX + zoneWidth &&
        point.y >= zoneY &&
        point.y <= zoneY + zoneHeight
      )
    })
  }

  // editScale converts a desired on-screen pixel size to canvas units - see
  // the comment in drawCanvas. Duplicated here (not read from drawCanvas's
  // local scope) since hit-testing needs it outside the render pass too.
  const getEditScale = () => {
    const canvas = canvasRef.current
    if (!canvas) return 1
    return canvas.width / (canvas.clientWidth || canvas.width)
  }

  const hitTestHandle = (point: { x: number; y: number }, rects: Rect[]) => {
    if (selectedZoneIndex === null) return null
    const canvas = canvasRef.current
    if (!canvas) return null
    const width = canvas.width
    const height = canvas.height
    const editScale = getEditScale()
    const handles = getResizeHandles(rects, selectedZoneIndex, template.zones)
    // Line and block handles for the same edge sit close together - pick
    // whichever is actually closest to the touch point (within its own
    // touch radius) instead of the first one that merely overlaps, so a tap
    // nearer the inset 'block' dot doesn't get swallowed by the 'line' one.
    let closest: (typeof handles)[number] | null = null
    let closestDist = Infinity
    for (const handle of handles) {
      const hx = (handle.x / 100) * width
      const hy = (handle.y / 100) * height
      const dotSize = handle.mode === 'line' ? 18 * editScale : 12 * editScale
      const radius = dotSize / 2 + 10 * editScale // generous touch target beyond the drawn dot
      const dist = Math.hypot(point.x - hx, point.y - hy)
      if (dist <= radius && dist < closestDist) {
        closestDist = dist
        closest = handle
      }
    }
    return closest
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(e)
    if (!point) return

    const rects = getEffectiveRects()
    const handle = pointersRef.current.size === 0 ? hitTestHandle(point, rects) : null
    if (handle && selectedZoneIndex !== null) {
      resizeRef.current = {
        edge: handle.edge,
        mode: handle.mode,
        zoneIndex: selectedZoneIndex,
        startPoint: point,
        startRects: rects,
      }
      pointersRef.current.set(e.pointerId, point)
      ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
      return
    }

    const zoneIndex = hitTestZone(point, rects)
    if (zoneIndex < 0) return

    moveCandidateRef.current = {
      zoneIndex,
      start: { x: point.x, y: point.y },
      moved: false,
    }

    const pointers = pointersRef.current
    pointers.set(e.pointerId, { x: point.x, y: point.y })
    ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
    const zoneState = stateManager.getState().zoneStates[zoneIndex]
    if (zoneState.photoIndex < 0) return

    activeZoneRef.current = zoneIndex

    const gesture = gestureRef.current

    if (pointers.size === 1) {
      gesture.startX = zoneState.x
      gesture.startY = zoneState.y
      gesture.startZoom = zoneState.zoom
      gesture.startCenter = { x: point.x, y: point.y }
    } else if (pointers.size === 2) {
      const points = Array.from(pointers.values())
      const dx = points[0].x - points[1].x
      const dy = points[0].y - points[1].y
      gesture.startDist = Math.hypot(dx, dy)
      gesture.startCenter = {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2,
      }
      gesture.startX = zoneState.x
      gesture.startY = zoneState.y
      gesture.startZoom = zoneState.zoom
    }

    const swap = swapRef.current
    if (pointers.size > 1) {
      if (swap.timer) {
        window.clearTimeout(swap.timer)
        swap.timer = null
      }
      swap.isSwapMode = false
      swap.fromZone = null
      swap.targetZone = null
      swap.startPoint = null
      return
    }
    swap.startPoint = point
    swap.fromZone = zoneIndex
    swap.targetZone = null
    swap.isSwapMode = false
    if (swap.timer) {
      window.clearTimeout(swap.timer)
    }
    swap.timer = window.setTimeout(() => {
      swap.isSwapMode = true
      if (navigator.vibrate) navigator.vibrate(15)
      drawCanvas()
    }, 350)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(e)
    if (!point) return

    const pointers = pointersRef.current
    if (!pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, { x: point.x, y: point.y })

    const resize = resizeRef.current
    if (resize) {
      const canvas = canvasRef.current
      if (!canvas) return
      const isVertical = resize.edge === 'left' || resize.edge === 'right'
      const deltaPx = isVertical ? point.x - resize.startPoint.x : point.y - resize.startPoint.y
      const deltaPct = (deltaPx / (isVertical ? canvas.width : canvas.height)) * 100
      const nextRects = resize.mode === 'block'
        ? resizeBlockEdge(resize.startRects, resize.zoneIndex, resize.edge, deltaPct)
        : resizeEdge(resize.startRects, resize.zoneIndex, resize.edge, deltaPct)
      nextRects.forEach((rect, i) => {
        const original = resize.startRects[i]
        if (rect.x !== original.x || rect.y !== original.y || rect.width !== original.width || rect.height !== original.height) {
          stateManager.updateZoneRect(i, rect)
        }
      })
      onStateChange()
      drawCanvas()
      return
    }

    if (moveCandidateRef.current && !moveCandidateRef.current.moved) {
      const dx = point.x - moveCandidateRef.current.start.x
      const dy = point.y - moveCandidateRef.current.start.y
      if (Math.hypot(dx, dy) > 6) {
        moveCandidateRef.current.moved = true
      }
    }

    const zoneIndex = activeZoneRef.current
    if (zoneIndex === null) return

    const swap = swapRef.current
    if (swap.startPoint && !swap.isSwapMode) {
      const dx = point.x - swap.startPoint.x
      const dy = point.y - swap.startPoint.y
      if (Math.hypot(dx, dy) > 14) {
        if (swap.timer) {
          window.clearTimeout(swap.timer)
          swap.timer = null
        }
      }
    }

    if (swap.isSwapMode) {
      const target = hitTestZone(point)
      swap.targetZone = target >= 0 ? target : null
      drawCanvas()
      return
    }

    const gesture = gestureRef.current

    if (pointers.size === 1) {
      const dx = point.x - gesture.startCenter.x
      const dy = point.y - gesture.startCenter.y
      stateManager.updateZoneTransform(zoneIndex, {
        x: gesture.startX + dx,
        y: gesture.startY + dy,
      })
    } else if (pointers.size === 2) {
      const points = Array.from(pointers.values())
      const dx = points[0].x - points[1].x
      const dy = points[0].y - points[1].y
      const newDist = Math.hypot(dx, dy)
      const scale = gesture.startDist > 0 ? newDist / gesture.startDist : 1
      const center = {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2,
      }
      const moveDx = center.x - gesture.startCenter.x
      const moveDy = center.y - gesture.startCenter.y
      stateManager.updateZoneTransform(zoneIndex, {
        zoom: Math.min(maxZoom, Math.max(minZoom, gesture.startZoom * scale)),
        x: gesture.startX + moveDx,
        y: gesture.startY + moveDy,
      })
    }

    onStateChange()
    drawCanvas()
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pointers = pointersRef.current
    if (!pointers.has(e.pointerId)) return
    pointers.delete(e.pointerId)

    if (resizeRef.current) {
      resizeRef.current = null
      return
    }

    const swap = swapRef.current
    if (swap.timer) {
      window.clearTimeout(swap.timer)
      swap.timer = null
    }

    if (swap.isSwapMode && swap.fromZone !== null && swap.targetZone !== null && swap.fromZone !== swap.targetZone) {
      stateManager.swapZoneStates(swap.fromZone, swap.targetZone)
      onZoneSelect(swap.targetZone)
      onStateChange()
      swap.isSwapMode = false
      swap.fromZone = null
      swap.targetZone = null
      swap.startPoint = null
      drawCanvas()
    } else {
      swap.isSwapMode = false
      swap.fromZone = null
      swap.targetZone = null
      swap.startPoint = null
    }

    if (pointers.size === 1) {
      const remaining = Array.from(pointers.values())[0]
      const zoneIndex = activeZoneRef.current
      if (zoneIndex !== null) {
        const zoneState = stateManager.getState().zoneStates[zoneIndex]
        gestureRef.current = {
          startX: zoneState.x,
          startY: zoneState.y,
          startZoom: zoneState.zoom,
          startDist: 0,
          startCenter: { x: remaining.x, y: remaining.y },
        }
      }
    }

    if (pointers.size === 0) {
      const candidate = moveCandidateRef.current
      moveCandidateRef.current = null
      if (candidate && !candidate.moved) {
        const now = Date.now()
        const last = lastClickRef.current
        if (!(last.zone === candidate.zoneIndex && now - last.time < 300)) {
          lastClickRef.current = { time: now, zone: candidate.zoneIndex }
          onZoneSelect(candidate.zoneIndex)
        } else {
          lastClickRef.current = { time: 0, zone: null }
          onZoneDoubleClick?.(candidate.zoneIndex)
        }
      }
      activeZoneRef.current = null
    }
  }

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (selectedZoneIndex === null) return
    const zoneState = stateManager.getState().zoneStates[selectedZoneIndex]
    if (zoneState.photoIndex < 0) return
    e.preventDefault()
    const delta = e.deltaY
    const step = delta > 0 ? -0.1 : 0.1
    const nextZoom = Math.min(maxZoom, Math.max(minZoom, zoneState.zoom + step))
    stateManager.updateZoneTransform(selectedZoneIndex, { zoom: nextZoom })
    onStateChange()
    drawCanvas()
  }

  const canvasWidth = Math.round(
    CONSTANTS.TARGET_IMAGE_WIDTH_PX * Math.min(1, template.aspectRatio)
  )
  const canvasHeight = Math.round(
    CONSTANTS.TARGET_IMAGE_WIDTH_PX / Math.max(1, template.aspectRatio)
  )

  useImperativeHandle(ref, () => ({
    renderFullResolution: async () => {
      const exportCanvas = document.createElement('canvas')
      exportCanvas.width = canvasWidth
      exportCanvas.height = canvasHeight
      const ctx = exportCanvas.getContext('2d')
      if (!ctx) throw new Error('2D context unavailable')

      const width = exportCanvas.width
      const height = exportCanvas.height

      ctx.fillStyle = '#f3f4f6'
      ctx.fillRect(0, 0, width, height)

      const state = stateManager.getState()
      const effectiveRects = getAllEffectiveRects(template.zones, state.zoneStates)

      // Sequential and awaited (not Promise.all) so at most one full-
      // resolution bitmap is decoded at a time, regardless of zone count -
      // this is the same crash this function exists to avoid re-introducing.
      for (let index = 0; index < template.zones.length; index++) {
        const rect = effectiveRects[index]
        const zoneState = state.zoneStates[index]
        const file = zoneState.photoIndex >= 0 ? state.photos[zoneState.photoIndex] : undefined

        const zoneX = (rect.x / 100) * width
        const zoneY = (rect.y / 100) * height
        const zoneWidth = (rect.width / 100) * width
        const zoneHeight = (rect.height / 100) * height

        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
        ctx.fillRect(zoneX, zoneY, zoneWidth, zoneHeight)

        if (file) {
          let bitmap: ImageBitmap | null = null
          try {
            bitmap = await createImageBitmap(file)
            ctx.save()
            ctx.beginPath()
            ctx.rect(zoneX, zoneY, zoneWidth, zoneHeight)
            ctx.clip()

            const scale = zoneState.zoom
            const imgWidth = bitmap.width * scale
            const imgHeight = bitmap.height * scale
            const centerX = zoneX + zoneWidth / 2 + zoneState.x
            const centerY = zoneY + zoneHeight / 2 + zoneState.y
            const rotation = (zoneState.rotation || 0) * (Math.PI / 180)

            ctx.translate(centerX, centerY)
            ctx.rotate(rotation)
            ctx.drawImage(bitmap, -imgWidth / 2, -imgHeight / 2, imgWidth, imgHeight)
            ctx.restore()
          } finally {
            bitmap?.close()
          }
        } else {
          ctx.fillStyle = '#e5e7eb'
          ctx.fillRect(zoneX + 2, zoneY + 2, zoneWidth - 4, zoneHeight - 4)
        }

        // Matches drawCanvas's non-selected/non-swap styling - this export
        // never has a "selected zone" or "swap mode" concept of its own.
        // Deliberately no zone-index number here (unlike the interactive
        // editor). Unlike the selection/swap highlighting, this border IS
        // part of the final saved photo (it's the collage separator).
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = Math.max(1, separatorWidth)
        if (showOuterBorder) {
          ctx.strokeRect(zoneX, zoneY, zoneWidth, zoneHeight)
        } else {
          const edgeEpsilon = 0.5
          const onLeftEdge = rect.x < edgeEpsilon
          const onRightEdge = rect.x + rect.width > 100 - edgeEpsilon
          const onTopEdge = rect.y < edgeEpsilon
          const onBottomEdge = rect.y + rect.height > 100 - edgeEpsilon
          ctx.beginPath()
          if (!onTopEdge) { ctx.moveTo(zoneX, zoneY); ctx.lineTo(zoneX + zoneWidth, zoneY) }
          if (!onRightEdge) { ctx.moveTo(zoneX + zoneWidth, zoneY); ctx.lineTo(zoneX + zoneWidth, zoneY + zoneHeight) }
          if (!onBottomEdge) { ctx.moveTo(zoneX + zoneWidth, zoneY + zoneHeight); ctx.lineTo(zoneX, zoneY + zoneHeight) }
          if (!onLeftEdge) { ctx.moveTo(zoneX, zoneY + zoneHeight); ctx.lineTo(zoneX, zoneY) }
          ctx.stroke()
        }
      }

      return exportCanvas
    },
  }), [template, stateManager, separatorWidth, showOuterBorder, canvasWidth, canvasHeight])

  return (
    <div className="w-full bg-gray-100 rounded-lg overflow-hidden">
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        className={`w-full h-auto ${maxHeightClassName} cursor-pointer touch-none select-none app-no-callout`}
      />
    </div>
  )
})
