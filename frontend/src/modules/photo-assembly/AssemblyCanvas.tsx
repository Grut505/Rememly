import { useRef, useEffect, useState } from 'react'
import { Template, ZoneDefinition } from './templates'
import { StateManager } from './StateManager'
import { CONSTANTS } from '../../utils/constants'

interface AssemblyCanvasProps {
  template: Template
  stateManager: StateManager
  onZoneClick: (zoneIndex: number) => void
}

export function AssemblyCanvas({
  template,
  stateManager,
  onZoneClick,
}: AssemblyCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [images, setImages] = useState<Map<number, HTMLImageElement>>(new Map())

  useEffect(() => {
    loadImages()
  }, [stateManager])

  useEffect(() => {
    drawCanvas()
  }, [template, images])

  const loadImages = async () => {
    const newImages = new Map<number, HTMLImageElement>()
    const state = stateManager.getState()

    for (let i = 0; i < state.photos.length; i++) {
      const file = state.photos[i]
      const img = new Image()
      const url = URL.createObjectURL(file)

      await new Promise<void>((resolve) => {
        img.onload = () => {
          newImages.set(i, img)
          resolve()
        }
        img.src = url
      })
    }

    setImages(newImages)
  }

  const drawCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height

    // Clear canvas
    ctx.fillStyle = '#f3f4f6'
    ctx.fillRect(0, 0, width, height)

    // Draw zones
    const state = stateManager.getState()
    template.zones.forEach((zone, index) => {
      const zoneState = state.zoneStates[index]
      const img = images.get(zoneState.photoIndex)

      const zoneX = (zone.x / 100) * width
      const zoneY = (zone.y / 100) * height
      const zoneWidth = (zone.width / 100) * width
      const zoneHeight = (zone.height / 100) * height

      // Draw border
      ctx.strokeStyle = '#d1d5db'
      ctx.lineWidth = 2
      ctx.strokeRect(zoneX, zoneY, zoneWidth, zoneHeight)

      if (img) {
        // Apply transformations and draw image
        ctx.save()
        ctx.beginPath()
        ctx.rect(zoneX, zoneY, zoneWidth, zoneHeight)
        ctx.clip()

        const scale = zoneState.zoom
        const imgWidth = img.width * scale
        const imgHeight = img.height * scale
        const imgX = zoneX + zoneState.x + (zoneWidth - imgWidth) / 2
        const imgY = zoneY + zoneState.y + (zoneHeight - imgHeight) / 2

        ctx.drawImage(img, imgX, imgY, imgWidth, imgHeight)
        ctx.restore()
      } else {
        // Draw placeholder
        ctx.fillStyle = '#e5e7eb'
        ctx.fillRect(zoneX + 2, zoneY + 2, zoneWidth - 4, zoneHeight - 4)
        ctx.fillStyle = '#9ca3af'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.font = '14px sans-serif'
        ctx.fillText('+', zoneX + zoneWidth / 2, zoneY + zoneHeight / 2)
      }
    })
  }

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100

    const clickedZoneIndex = template.zones.findIndex((zone) => {
      return (
        x >= zone.x &&
        x <= zone.x + zone.width &&
        y >= zone.y &&
        y <= zone.y + zone.height
      )
    })

    if (clickedZoneIndex >= 0) {
      onZoneClick(clickedZoneIndex)
    }
  }

  return (
    <div className="w-full bg-gray-100 rounded-lg overflow-hidden">
      <canvas
        ref={canvasRef}
        width={CONSTANTS.TARGET_IMAGE_WIDTH_PX}
        height={CONSTANTS.TARGET_IMAGE_WIDTH_PX}
        onClick={handleCanvasClick}
        className="w-full h-auto cursor-pointer touch-manipulation"
      />
    </div>
  )
}
