import { useState, useEffect } from 'react'
import { StateManager } from './StateManager'

interface ZoneControllerProps {
  zoneIndex: number
  stateManager: StateManager
  onUpdate: () => void
  onClose: () => void
  onAddPhoto: (zoneIndex: number) => void
  onFitPhoto: (zoneIndex: number) => void
  onFitPhotoContain: (zoneIndex: number) => void
  onFitPhotoWidth: (zoneIndex: number) => void
  onFitPhotoHeight: (zoneIndex: number) => void
  onCenterPhoto: (zoneIndex: number) => void
}

export function ZoneController({
  zoneIndex,
  stateManager,
  onUpdate,
  onClose,
  onAddPhoto,
  onFitPhoto,
  onFitPhotoContain,
  onFitPhotoWidth,
  onFitPhotoHeight,
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
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-3 py-2 shadow-lg z-20">
      <div className="max-w-mobile mx-auto">
        <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap">
          <button
            onClick={onClose}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            title="Close"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
          <button
            onClick={() => onAddPhoto(zoneIndex)}
            className="h-9 w-9 flex items-center justify-center rounded-lg bg-primary-600 text-white hover:bg-primary-700"
            title="Add/Replace"
            aria-label="Add/Replace"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14"></path>
            </svg>
          </button>
          <button
            onClick={handleRemovePhoto}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            title="Remove"
            aria-label="Remove"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M3 6h18"></path>
              <path d="M8 6V4h8v2"></path>
              <path d="M6 6l1 14h10l1-14"></path>
            </svg>
          </button>
          <button
            onClick={() => onFitPhoto(zoneIndex)}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            title="Auto-fit"
            aria-label="Auto-fit"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M4 4h6v2H6v4H4zM20 4h-6v2h4v4h2zM4 20h6v-2H6v-4H4zM20 20h-6v-2h4v-4h2z"></path>
            </svg>
          </button>
          <button
            onClick={() => onFitPhotoContain(zoneIndex)}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            title="Fit inside"
            aria-label="Fit inside"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <rect x="4" y="4" width="16" height="16" rx="2"></rect>
              <rect x="8" y="8" width="8" height="8" rx="1"></rect>
            </svg>
          </button>
          <button
            onClick={() => onFitPhotoWidth(zoneIndex)}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            title="Fit width"
            aria-label="Fit width"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M4 12h16"></path>
              <path d="M8 8l-4 4 4 4"></path>
              <path d="M16 8l4 4-4 4"></path>
            </svg>
          </button>
          <button
            onClick={() => onFitPhotoHeight(zoneIndex)}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            title="Fit height"
            aria-label="Fit height"
          >
            <svg className="w-4 h-4 rotate-90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M4 12h16"></path>
              <path d="M8 8l-4 4 4 4"></path>
              <path d="M16 8l4 4-4 4"></path>
            </svg>
          </button>
          <button
            onClick={() => onCenterPhoto(zoneIndex)}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            title="Center"
            aria-label="Center"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="2"></circle>
              <path d="M12 4v4M12 16v4M4 12h4M16 12h4"></path>
            </svg>
          </button>
          <button
            onClick={() => handleRotate('left')}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            title="Rotate left"
            aria-label="Rotate left"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M4 7h6v6"></path>
              <path d="M20 17a8 8 0 1 1-6-14"></path>
            </svg>
          </button>
          <button
            onClick={() => handleRotate('right')}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            title="Rotate right"
            aria-label="Rotate right"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M20 7h-6v6"></path>
              <path d="M4 17a8 8 0 1 0 6-14"></path>
            </svg>
          </button>
          <button
            onClick={handleReset}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            title="Reset"
            aria-label="Reset"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M3 12a9 9 0 1 0 3-6.7"></path>
              <path d="M3 4v4h4"></path>
            </svg>
          </button>
          <div className="flex items-center gap-2 px-2">
            <span className="text-xs text-gray-500">{zoom.toFixed(1)}x</span>
            <input
              type="range"
              min="0.1"
              max="8"
              step="0.1"
              value={zoom}
              onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
              className="w-28 accent-primary-600"
              aria-label="Zoom"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
