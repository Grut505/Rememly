import { useState, useEffect } from 'react'
import { StateManager } from './StateManager'
import { Slider } from '../../ui/Slider'

interface ZoneControllerProps {
  zoneIndex: number
  stateManager: StateManager
  photoFormatLabel?: string
  onUpdate: () => void
  onClose: () => void
  onAddPhoto: (zoneIndex: number) => void
  onFitPhoto: (zoneIndex: number) => void
  onFitPhotoContain: (zoneIndex: number) => void
  onFitPhotoWidth: (zoneIndex: number) => void
  onFitPhotoHeight: (zoneIndex: number) => void
  onCenterPhoto: (zoneIndex: number) => void
  onFineAdjust: (zoneIndex: number) => void
}

export function ZoneController({
  zoneIndex,
  stateManager,
  photoFormatLabel,
  onUpdate,
  onClose,
  onAddPhoto,
  onFitPhoto,
  onFitPhotoContain,
  onFitPhotoWidth,
  onFitPhotoHeight,
  onCenterPhoto,
  onFineAdjust,
}: ZoneControllerProps) {
  const state = stateManager.getState()
  const zoneState = state.zoneStates[zoneIndex]
  const hasPhoto = zoneState.photoIndex >= 0

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
    // Also drop any drag-resize override on the zone's own shape, back to
    // the template's original rect - Revert previously only touched the
    // photo's zoom/pan/rotation inside the zone, leaving a resized block
    // untouched even though the button doesn't distinguish the two.
    stateManager.updateZoneRect(zoneIndex, undefined)
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

  const handleBringForward = () => {
    stateManager.bringZoneForward(zoneIndex)
    onUpdate()
  }

  const handleSendBackward = () => {
    stateManager.sendZoneBackward(zoneIndex)
    onUpdate()
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-2 shadow-lg z-20 app-safe-x app-safe-bottom">
      <div className="max-w-mobile mx-auto">
        {hasPhoto && photoFormatLabel && (
          <div className="text-xs text-gray-500 px-1 pb-1.5">{photoFormatLabel}</div>
        )}
        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={() => onAddPhoto(zoneIndex)}
            className="h-11 w-11 flex-shrink-0 flex items-center justify-center rounded-lg bg-primary-600 text-white hover:bg-primary-700"
            title="Add/Replace"
            aria-label="Add/Replace"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14"></path>
            </svg>
          </button>
          <button
            onClick={handleRemovePhoto}
            className="h-11 w-11 flex-shrink-0 flex items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            title="Remove"
            aria-label="Remove"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M3 6h18"></path>
              <path d="M8 6V4h8v2"></path>
              <path d="M6 6l1 14h10l1-14"></path>
            </svg>
          </button>
          <button
            onClick={() => onFitPhoto(zoneIndex)}
            className="h-11 w-11 flex-shrink-0 flex items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            title="Auto-fit"
            aria-label="Auto-fit"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M4 4h6v2H6v4H4zM20 4h-6v2h4v4h2zM4 20h6v-2H6v-4H4zM20 20h-6v-2h4v-4h2z"></path>
            </svg>
          </button>
          <button
            onClick={() => onFitPhotoContain(zoneIndex)}
            className="h-11 w-11 flex-shrink-0 flex items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            title="Fit inside"
            aria-label="Fit inside"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <rect x="4" y="4" width="16" height="16" rx="2"></rect>
              <rect x="8" y="8" width="8" height="8" rx="1"></rect>
            </svg>
          </button>
          <button
            onClick={() => onFitPhotoWidth(zoneIndex)}
            className="h-11 w-11 flex-shrink-0 flex items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            title="Fit width"
            aria-label="Fit width"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M4 12h16"></path>
              <path d="M8 8l-4 4 4 4"></path>
              <path d="M16 8l4 4-4 4"></path>
            </svg>
          </button>
          <button
            onClick={() => onFitPhotoHeight(zoneIndex)}
            className="h-11 w-11 flex-shrink-0 flex items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            title="Fit height"
            aria-label="Fit height"
          >
            <svg className="w-5 h-5 rotate-90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M4 12h16"></path>
              <path d="M8 8l-4 4 4 4"></path>
              <path d="M16 8l4 4-4 4"></path>
            </svg>
          </button>
          <button
            onClick={() => onCenterPhoto(zoneIndex)}
            className="h-11 w-11 flex-shrink-0 flex items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            title="Center"
            aria-label="Center"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="2"></circle>
              <path d="M12 4v4M12 16v4M4 12h4M16 12h4"></path>
            </svg>
          </button>
          <button
            onClick={() => handleRotate('left')}
            className="h-11 w-11 flex-shrink-0 flex items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            title="Rotate left"
            aria-label="Rotate left"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M3 12a9 9 0 1 0 2.64-6.36L3 8"></path>
              <path d="M3 3v5h5"></path>
            </svg>
          </button>
          <button
            onClick={() => handleRotate('right')}
            className="h-11 w-11 flex-shrink-0 flex items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            title="Rotate right"
            aria-label="Rotate right"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"></path>
              <path d="M21 3v5h-5"></path>
            </svg>
          </button>
          <button
            onClick={handleBringForward}
            disabled={!stateManager.canBringZoneForward(zoneIndex)}
            className="h-11 w-11 flex-shrink-0 flex items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Bring forward"
            aria-label="Bring forward"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <rect x="9" y="9" width="11" height="11" rx="1"></rect>
              <path d="M5 15V6a1 1 0 0 1 1-1h9"></path>
            </svg>
          </button>
          <button
            onClick={handleSendBackward}
            disabled={!stateManager.canSendZoneBackward(zoneIndex)}
            className="h-11 w-11 flex-shrink-0 flex items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Send backward"
            aria-label="Send backward"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <rect x="4" y="4" width="11" height="11" rx="1"></rect>
              <path d="M9.5 15h9a1 1 0 0 0 1-1V6"></path>
            </svg>
          </button>
          <button
            onClick={() => onFineAdjust(zoneIndex)}
            disabled={!hasPhoto}
            className="h-11 w-11 flex-shrink-0 flex items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Fine adjust (enlarged view)"
            aria-label="Fine adjust"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="10" cy="10" r="6"></circle>
              <path d="M14.5 14.5L20 20"></path>
              <path d="M10 8v4M8 10h4"></path>
            </svg>
          </button>
        </div>
        <Slider
          label="Zoom"
          min={0.1}
          max={8}
          step={0.1}
          value={zoom}
          onChange={handleZoomChange}
          formatValue={(v) => `${v.toFixed(1)}x`}
          className="mt-2"
        />
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 h-11 flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium"
            title="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12"></path>
            </svg>
            Close
          </button>
          <button
            onClick={handleReset}
            className="flex-1 h-11 flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium"
            title="Revert this zone's zoom, position, rotation and any resize"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M9 14 4 9l5-5"></path>
              <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"></path>
            </svg>
            Revert
          </button>
        </div>
      </div>
    </div>
  )
}
