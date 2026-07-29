import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { AssemblyCanvas } from './AssemblyCanvas'
import { StateManager } from './StateManager'
import { LayoutTemplate } from './layoutRegistry'
import { Slider } from '../../ui/Slider'
import { CONSTANTS } from '../../utils/constants'

interface ZoneFineEditorProps {
  photo: File
  zoom: number
  x: number
  y: number
  rotation: number
  realZoneWidthPx: number
  realZoneHeightPx: number
  onApply: (transform: { zoom: number; x: number; y: number; rotation: number }) => void
  onClose: () => void
}

// Editing a photo's position/zoom directly on its zone is impractical when
// the zone is small (fat-finger pinch/pan on a tiny target). This reuses
// AssemblyCanvas with a single zone that fills the whole view instead, so
// the exact same gesture code gets a much bigger surface to work with.
// The zone here is `scale` times bigger than the real one, so zoom/x/y are
// scaled up on the way in and back down on Apply to keep them equivalent.
export function ZoneFineEditor({
  photo,
  zoom,
  x,
  y,
  rotation,
  realZoneWidthPx,
  realZoneHeightPx,
  onApply,
  onClose,
}: ZoneFineEditorProps) {
  const aspectRatio = realZoneWidthPx / realZoneHeightPx || 1

  const fineTemplate: LayoutTemplate = useMemo(
    () => ({
      id: 'fine-edit',
      name: 'Fine edit',
      aspectRatio,
      zones: [{ x: 0, y: 0, width: 100, height: 100 }],
    }),
    [aspectRatio]
  )

  const fineCanvasWidth = Math.round(CONSTANTS.TARGET_IMAGE_WIDTH_PX * Math.min(1, aspectRatio))
  const scale = realZoneWidthPx > 0 ? fineCanvasWidth / realZoneWidthPx : 1

  const [stateManager] = useState(() => {
    const manager = new StateManager('fine-edit', 1)
    const photoIndex = manager.addPhoto(photo)
    manager.assignPhotoToZone(photoIndex, 0)
    manager.updateZoneTransform(0, { zoom: zoom * scale, x: x * scale, y: y * scale, rotation })
    return manager
  })
  const [stateVersion, setStateVersion] = useState(0)
  const [canvasKey, setCanvasKey] = useState(0)

  const currentZoom = stateManager.getState().zoneStates[0].zoom

  const handleUpdate = () => setStateVersion((v) => v + 1)

  const handleZoomSlider = (nextZoom: number) => {
    stateManager.updateZoneTransform(0, { zoom: nextZoom })
    setCanvasKey((k) => k + 1)
    setStateVersion((v) => v + 1)
  }

  const handleApply = () => {
    const zoneState = stateManager.getState().zoneStates[0]
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
    onApply({
      zoom: clamp(zoneState.zoom / scale, 0.1, 8),
      x: zoneState.x / scale,
      y: zoneState.y / scale,
      rotation: zoneState.rotation || 0,
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-[1100] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
        <button onClick={onClose} className="px-3 py-2 text-sm text-gray-600 touch-manipulation">
          Cancel
        </button>
        <span className="text-sm font-semibold text-gray-900">Fine adjust</span>
        <button
          onClick={handleApply}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 touch-manipulation"
        >
          Apply
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center p-3 overflow-hidden">
        <div className="w-full">
          <AssemblyCanvas
            key={canvasKey}
            template={fineTemplate}
            stateManager={stateManager}
            selectedZoneIndex={0}
            onZoneSelect={() => {}}
            onStateChange={handleUpdate}
            stateVersion={stateVersion}
            separatorWidth={0}
            minZoom={0.05}
            maxZoom={Math.max(20, 8 * scale)}
            maxHeightClassName="max-h-[75vh]"
          />
        </div>
      </div>
      <div className="bg-white border-t border-gray-200 px-4 py-3">
        <Slider
          label="Zoom"
          min={0.05}
          max={Math.max(20, 8 * scale)}
          step={0.05}
          value={currentZoom}
          onChange={handleZoomSlider}
          formatValue={(v) => `${v.toFixed(1)}x`}
        />
        <p className="text-xs text-gray-500 mt-2 text-center">
          Drag to move · pinch or use the slider to zoom
        </p>
      </div>
    </div>,
    document.body
  )
}
