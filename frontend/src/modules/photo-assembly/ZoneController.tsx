import { useState } from 'react'
import { StateManager } from './StateManager'

interface ZoneControllerProps {
  zoneIndex: number
  stateManager: StateManager
  onUpdate: () => void
  onClose: () => void
}

export function ZoneController({
  zoneIndex,
  stateManager,
  onUpdate,
  onClose,
}: ZoneControllerProps) {
  const state = stateManager.getState()
  const zoneState = state.zoneStates[zoneIndex]

  const [zoom, setZoom] = useState(zoneState.zoom)

  const handleZoomChange = (newZoom: number) => {
    setZoom(newZoom)
    stateManager.updateZoneTransform(zoneIndex, { zoom: newZoom })
    onUpdate()
  }

  const handleReset = () => {
    stateManager.updateZoneTransform(zoneIndex, { zoom: 1, x: 0, y: 0 })
    setZoom(1)
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

        <div>
          <label className="block text-sm text-gray-600 mb-2">
            Zoom: {zoom.toFixed(1)}x
          </label>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.1"
            value={zoom}
            onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
            className="w-full"
          />
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
