import { useState, useRef } from 'react'
import { LAYOUTS, LayoutTemplate } from './layoutRegistry'
import { StateManager } from './StateManager'
import { TemplateSelector } from './TemplateSelector'
import { AssemblyCanvas } from './AssemblyCanvas'
import { ZoneController } from './ZoneController'
import { Toolbar } from './Toolbar'
import { canvasToBase64 } from '../../utils/image'
import { useUiStore } from '../../state/uiStore'
import { Modal } from '../../ui/Modal'
import { CONSTANTS } from '../../utils/constants'

interface PhotoAssemblyProps {
  onComplete: (imageBase64: string, assemblyState: object) => void
  onCancel: () => void
}

export function PhotoAssembly({ onComplete, onCancel }: PhotoAssemblyProps) {
  const { showToast } = useUiStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const zoneFileInputRef = useRef<HTMLInputElement>(null)

  const [selectedTemplate, setSelectedTemplate] = useState<LayoutTemplate>(LAYOUTS[0])
  const [stateManager, setStateManager] = useState<StateManager>(
    () => new StateManager(LAYOUTS[0].id, LAYOUTS[0].zones.length)
  )
  const [selectedZoneIndex, setSelectedZoneIndex] = useState<number | null>(null)
  const [canvasKey, setCanvasKey] = useState(0)
  const [stateVersion, setStateVersion] = useState(0)
  const [isLayoutModalOpen, setIsLayoutModalOpen] = useState(false)
  const [isZonesModalOpen, setIsZonesModalOpen] = useState(false)
  const [pendingZoneIndex, setPendingZoneIndex] = useState<number | null>(null)

  const handleTemplateSelect = (template: LayoutTemplate) => {
    setSelectedTemplate(template)
    setStateManager(new StateManager(template.id, template.zones.length))
    setSelectedZoneIndex(null)
    setCanvasKey((k) => k + 1)
    setStateVersion((v) => v + 1)
    setIsLayoutModalOpen(false)
  }

  const handleAddPhoto = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const state = stateManager.getState()
    const emptyZoneIndices = state.zoneStates
      .map((zone, index) => (zone.photoIndex === -1 ? index : null))
      .filter((index): index is number => index !== null)

    if (pendingZoneIndex !== null) {
      const file = files[0]
      const photoIndex = stateManager.addPhoto(file)
      stateManager.assignPhotoToZone(photoIndex, pendingZoneIndex)
      setSelectedZoneIndex(pendingZoneIndex)
      setPendingZoneIndex(null)
    } else {
      let assigned = 0
      emptyZoneIndices.forEach((zoneIndex, idx) => {
        const file = files[idx]
        if (!file) return
        const photoIndex = stateManager.addPhoto(file)
        stateManager.assignPhotoToZone(photoIndex, zoneIndex)
        assigned += 1
      })
      if (assigned === 0) {
        showToast('Toutes les zones sont déjà remplies', 'info')
      } else if (files.length > assigned) {
        showToast(`${files.length - assigned} photo(s) ignorée(s) (zones pleines)`, 'info')
      }
    }

    setCanvasKey((k) => k + 1)
    setStateVersion((v) => v + 1)

    // Clear input
    e.target.value = ''
  }

  const handleZoneClick = (zoneIndex: number) => {
    setSelectedZoneIndex(zoneIndex)
  }

  const handleZoneUpdate = () => {
    setCanvasKey((k) => k + 1)
    setStateVersion((v) => v + 1)
  }

  const getCanvasSize = (template: LayoutTemplate) => {
    const base = CONSTANTS.TARGET_IMAGE_WIDTH_PX
    const aspect = template.aspectRatio || 1
    return {
      width: Math.round(base * Math.min(1, aspect)),
      height: Math.round(base / Math.max(1, aspect)),
    }
  }

  const handleCenterZone = (zoneIndex: number) => {
    stateManager.updateZoneTransform(zoneIndex, { x: 0, y: 0 })
    handleZoneUpdate()
  }

  const handleFitZone = async (zoneIndex: number) => {
    const photo = stateManager.getPhotoForZone(zoneIndex)
    if (!photo) {
      showToast('Ajoute une photo dans la zone avant', 'info')
      return
    }

    const template = selectedTemplate
    const zone = template.zones[zoneIndex]
    if (!zone) return

    const { width: canvasWidth, height: canvasHeight } = getCanvasSize(template)
    const zoneWidth = (zone.width / 100) * canvasWidth
    const zoneHeight = (zone.height / 100) * canvasHeight

    const zoneState = stateManager.getState().zoneStates[zoneIndex]
    const rotation = zoneState.rotation || 0

    const img = new Image()
    const url = URL.createObjectURL(photo)

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('load'))
      img.src = url
    }).catch(() => {
      showToast('Impossible de charger cette photo', 'error')
    })

    URL.revokeObjectURL(url)

    if (!img.width || !img.height) return

    const isRotated = Math.abs(rotation % 180) === 90
    const imgWidth = isRotated ? img.height : img.width
    const imgHeight = isRotated ? img.width : img.height

    const scale = Math.max(zoneWidth / imgWidth, zoneHeight / imgHeight)
    const nextZoom = Math.min(5, Math.max(0.5, scale))

    stateManager.updateZoneTransform(zoneIndex, { zoom: nextZoom, x: 0, y: 0 })
    handleZoneUpdate()
  }

  const handleValidate = async () => {
    if (!stateManager.isComplete()) {
      showToast('Please fill all zones', 'error')
      return
    }

    try {
      // Generate final image from canvas
      const canvas = document.querySelector('canvas') as HTMLCanvasElement
      if (!canvas) {
        showToast('Failed to generate image', 'error')
        return
      }

      const imageBase64 = await canvasToBase64(canvas, 0.9)
      const assemblyState = stateManager.serialize()

      onComplete(imageBase64, assemblyState)
    } catch (error) {
      showToast('Failed to create assembly', 'error')
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center sticky top-0 z-10">
        <button
          onClick={onCancel}
          className="text-gray-600 touch-manipulation"
        >
          ← Back
        </button>
        <h1 className="text-lg font-semibold ml-4">Photo Assembly</h1>
      </header>

      {/* Layout bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-14 z-10">
        <div>
          <div className="text-sm text-gray-600">Layout</div>
          <div className="text-sm font-semibold text-gray-900">
            {selectedTemplate?.name} • {selectedTemplate?.zones.length} photos
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsZonesModalOpen(true)}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:border-gray-400"
          >
            Zones
          </button>
          <button
            onClick={() => setIsLayoutModalOpen(true)}
            className="px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
          >
            Choisir
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 pb-32">
        <div className="p-4">
          <AssemblyCanvas
            key={canvasKey}
            template={selectedTemplate}
            stateManager={stateManager}
            selectedZoneIndex={selectedZoneIndex}
            onZoneSelect={handleZoneClick}
            onStateChange={() => setStateVersion((v) => v + 1)}
            stateVersion={stateVersion}
          />
        </div>
      </div>

      {/* Zone Controller */}
      {selectedZoneIndex !== null && (
        <ZoneController
          zoneIndex={selectedZoneIndex}
          stateManager={stateManager}
          onUpdate={handleZoneUpdate}
          onClose={() => setSelectedZoneIndex(null)}
          onAddPhoto={(zoneIndex) => {
            setPendingZoneIndex(zoneIndex)
            zoneFileInputRef.current?.click()
          }}
          onFitPhoto={handleFitZone}
          onCenterPhoto={handleCenterZone}
        />
      )}

      {/* Toolbar */}
      <Toolbar
        onAddPhoto={handleAddPhoto}
        onValidate={handleValidate}
        onCancel={onCancel}
        isValid={stateManager.isComplete()}
        onOpenZones={() => setIsZonesModalOpen(true)}
      />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Hidden file input for zone replace */}
      <input
        ref={zoneFileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />

      <Modal
        isOpen={isLayoutModalOpen}
        onClose={() => setIsLayoutModalOpen(false)}
        title="Choisir un layout"
      >
        <TemplateSelector
          selectedTemplateId={selectedTemplate.id}
          onSelect={handleTemplateSelect}
          layouts={LAYOUTS}
        />
      </Modal>

      <Modal
        isOpen={isZonesModalOpen}
        onClose={() => setIsZonesModalOpen(false)}
        title="Zones"
      >
        <div className="p-4 space-y-3">
          {stateManager.getState().zoneStates.map((zone, index) => (
            <div
              key={`zone-${index}`}
              className="flex items-center justify-between p-3 border border-gray-200 rounded-lg"
            >
              <div>
                <div className="text-sm font-medium text-gray-900">
                  Zone {index + 1}
                </div>
                <div className="text-xs text-gray-500">
                  {zone.photoIndex >= 0 ? 'Photo assignée' : 'Vide'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setSelectedZoneIndex(index)
                    setIsZonesModalOpen(false)
                  }}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:border-gray-400"
                >
                  Sélectionner
                </button>
                <button
                  onClick={() => {
                    setPendingZoneIndex(index)
                    setIsZonesModalOpen(false)
                    zoneFileInputRef.current?.click()
                  }}
                  className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
                >
                  Ajouter
                </button>
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}
