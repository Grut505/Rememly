import { useRef, useEffect, useState } from 'react'
import { LayoutTemplate } from './layoutRegistry'
import { StateManager } from './StateManager'
import { CONSTANTS } from '../../utils/constants'

interface AssemblyCanvasProps {
  template: LayoutTemplate
  stateManager: StateManager
  selectedZoneIndex: number | null
  onZoneSelect: (zoneIndex: number) => void
  onStateChange: () => void
  stateVersion: number
  separatorWidth: number
}

export function AssemblyCanvas({
  template,
  stateManager,
  selectedZoneIndex,
  onZoneSelect,
  onStateChange,
  stateVersion,
  separatorWidth,
}: AssemblyCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [images, setImages] = useState<Map<number, HTMLImageElement>>(new Map())
  const activeZoneRef = useRef<number | null>(null)
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const gestureRef = useRef({
    startX: 0,
    startY: 0,
    startZoom: 1,
    startDist: 0,
    startCenter: { x: 0, y: 0 },
  })
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
  }, [template, images, stateVersion, selectedZoneIndex, separatorWidth])

  const loadImages = async () => {
    const newImages = new Map<number, HTMLImageElement>()
    const state = stateManager.getState()
    const objectUrls: string[] = []

    for (let i = 0; i < state.photos.length; i++) {
      const file = state.photos[i]
      const img = new Image()
      const url = URL.createObjectURL(file)
      objectUrls.push(url)

      await new Promise<void>((resolve) => {
        img.onload = () => {
          newImages.set(i, img)
          resolve()
        }
        img.src = url
      })
    }

    setImages(newImages)
    objectUrls.forEach((url) => URL.revokeObjectURL(url))
  }

  const drawCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height

    ctx.fillStyle = '#f3f4f6'
    ctx.fillRect(0, 0, width, height)

    const state = stateManager.getState()

    template.zones.forEach((zone, index) => {
      const zoneState = state.zoneStates[index]
      const img = images.get(zoneState.photoIndex)

      const zoneX = (zone.x / 100) * width
      const zoneY = (zone.y / 100) * height
      const zoneWidth = (zone.width / 100) * width
      const zoneHeight = (zone.height / 100) * height

      ctx.fillStyle = index === selectedZoneIndex ? 'rgba(37, 99, 235, 0.08)' : 'rgba(255, 255, 255, 0.6)'
      ctx.fillRect(zoneX, zoneY, zoneWidth, zoneHeight)

      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = Math.max(1, separatorWidth)
      ctx.strokeRect(zoneX, zoneY, zoneWidth, zoneHeight)

      if (img) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(zoneX, zoneY, zoneWidth, zoneHeight)
        ctx.clip()

        const scale = zoneState.zoom
        const imgWidth = img.width * scale
        const imgHeight = img.height * scale
        const centerX = zoneX + zoneWidth / 2 + zoneState.x
        const centerY = zoneY + zoneHeight / 2 + zoneState.y
        const rotation = (zoneState.rotation || 0) * (Math.PI / 180)

        ctx.translate(centerX, centerY)
        ctx.rotate(rotation)
        ctx.drawImage(img, -imgWidth / 2, -imgHeight / 2, imgWidth, imgHeight)
        ctx.restore()
      } else {
        ctx.fillStyle = '#e5e7eb'
        ctx.fillRect(zoneX + 2, zoneY + 2, zoneWidth - 4, zoneHeight - 4)
        ctx.fillStyle = '#9ca3af'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.font = '14px sans-serif'
        ctx.fillText('+', zoneX + zoneWidth / 2, zoneY + zoneHeight / 2)
      }

      ctx.fillStyle = index === selectedZoneIndex ? '#1d4ed8' : '#6b7280'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(`${index + 1}`, zoneX + 6, zoneY + 6)
    })

    const swapTarget = swapRef.current.targetZone
    if (swapTarget !== null && swapTarget >= 0) {
      const zone = template.zones[swapTarget]
      const zoneX = (zone.x / 100) * width
      const zoneY = (zone.y / 100) * height
      const zoneWidth = (zone.width / 100) * width
      const zoneHeight = (zone.height / 100) * height
      ctx.strokeStyle = '#10b981'
      ctx.lineWidth = 3
      ctx.strokeRect(zoneX, zoneY, zoneWidth, zoneHeight)
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

  const hitTestZone = (point: { x: number; y: number }) => {
    const canvas = canvasRef.current
    if (!canvas) return -1
    const width = canvas.width
    const height = canvas.height
    return template.zones.findIndex((zone) => {
      const zoneX = (zone.x / 100) * width
      const zoneY = (zone.y / 100) * height
      const zoneWidth = (zone.width / 100) * width
      const zoneHeight = (zone.height / 100) * height
      return (
        point.x >= zoneX &&
        point.x <= zoneX + zoneWidth &&
        point.y >= zoneY &&
        point.y <= zoneY + zoneHeight
      )
    })
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(e)
    if (!point) return

    const zoneIndex = hitTestZone(point)
    if (zoneIndex < 0) return

    onZoneSelect(zoneIndex)

    const zoneState = stateManager.getState().zoneStates[zoneIndex]
    if (zoneState.photoIndex < 0) return

    activeZoneRef.current = zoneIndex

    const pointers = pointersRef.current
    pointers.set(e.pointerId, { x: point.x, y: point.y })
    ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
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
      drawCanvas()
    }, 250)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(e)
    if (!point) return

    const zoneIndex = activeZoneRef.current
    if (zoneIndex === null) return

    const pointers = pointersRef.current
    if (!pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, { x: point.x, y: point.y })

    const swap = swapRef.current
    if (swap.startPoint && !swap.isSwapMode) {
      const dx = point.x - swap.startPoint.x
      const dy = point.y - swap.startPoint.y
      if (Math.hypot(dx, dy) > 8) {
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
        zoom: Math.min(5, Math.max(0.5, gesture.startZoom * scale)),
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
    const nextZoom = Math.min(5, Math.max(0.5, zoneState.zoom + step))
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
        className="w-full h-auto max-h-[55vh] cursor-pointer touch-none"
      />
    </div>
  )
}
