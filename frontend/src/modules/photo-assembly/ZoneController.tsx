import { useState, useEffect } from 'react'
import { StateManager } from './StateManager'

interface ZoneControllerProps {
  zoneIndex: number
  stateManager: StateManager
  onUpdate: () => void
  onClose: () => void
  onAddPhoto: (zoneIndex: number) => void
  onFitPhoto: (zoneIndex: number) => void
  onCenterPhoto: (zoneIndex: number) => void
}

export function ZoneController({
  zoneIndex,
  stateManager,
  onUpdate,
  onClose,
  onAddPhoto,
  onFitPhoto,
  onCenterPhoto,
}: ZoneControllerProps) {
  const state = stateManager.getState()
  const zoneState = state.zoneStates[zoneIndex]

  const [zoom, setZoom] = useState(zoneState.zoom)
  const [rotation, setRotation] = useState(zoneState.rotation || 0)

  useEffect(() => {
    setZoom(zoneState.zoom)
    setRotation(zoneState.rotation || 0)
  }, [zoneState.zoom, zoneState.rotation, zoneIndex])

  const handleZoomChange = (newZoom: number) => {
    setZoom(newZoom)
    stateManager.updateZoneTransform(zoneIndex, { zoom: newZoom })
    onUpdate()
  }

  const handleReset = () => {
    stateManager.updateZoneTransform(zoneIndex, { zoom: 1, x: 0, y: 0, rotation: 0 })
    setZoom(1)
    setRotation(0)
    onUpdate()
  }

  const handleRotate = (direction: 'left' | 'right') => {
    const next = (rotation + (direction === 'left' ? -90 : 90) + 360) % 360
    setRotation(next)
    stateManager.updateZoneTransform(zoneIndex, { rotation: next })
    onUpdate()
  }

  const handleRemovePhoto = () => {
    stateManager.removePhotoFromZone(zoneIndex)
    setZoom(1)
    setRotation(0)
    onUpdate()
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg z-20">
      <div className="max-w-mobile mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">
            Zone {zoneIndex + 1}
          </span>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-900"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onAddPhoto(zoneIndex)}
            className="px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
          >
            Ajouter / Remplacer
          </button>
          <button
            onClick={handleRemovePhoto}
            className="px-3 py-2 rounded-lg bg-gray-200 text-gray-900 text-sm font-medium hover:bg-gray-300"
          >
            Retirer
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onFitPhoto(zoneIndex)}
            className="px-3 py-2 rounded-lg bg-gray-200 text-gray-900 text-sm font-medium hover:bg-gray-300"
          >
            Auto-fit
          </button>
          <button
            onClick={() => onCenterPhoto(zoneIndex)}
            className="px-3 py-2 rounded-lg bg-gray-200 text-gray-900 text-sm font-medium hover:bg-gray-300"
          >
            Centrer
          </button>
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-2">
            Zoom: {zoom.toFixed(1)}x
          </label>
          <input
            type="range"
            min="0.5"
            max="5"
            step="0.1"
            value={zoom}
            onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
            className="w-full"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleRotate('left')}
            className="flex-1 px-3 py-2 rounded-lg bg-gray-200 text-gray-900 text-sm font-medium hover:bg-gray-300"
          >
            Tourner -90°
          </button>
          <button
            onClick={() => handleRotate('right')}
            className="flex-1 px-3 py-2 rounded-lg bg-gray-200 text-gray-900 text-sm font-medium hover:bg-gray-300"
          >
            Tourner +90°
          </button>
        </div>

        <button
          onClick={handleReset}
          className="w-full px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300"
        >
          Reset Zone
        </button>
      </div>
    </div>
  )
}
