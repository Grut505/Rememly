import { useState, useRef } from 'react'
import { LAYOUTS, LayoutTemplate } from './layoutRegistry'
import { StateManager } from './StateManager'
import { TemplateSelector } from './TemplateSelector'
import { AssemblyCanvas } from './AssemblyCanvas'
import { ZoneController } from './ZoneController'
import { canvasToBase64 } from '../../utils/image'
import { useUiStore } from '../../state/uiStore'
import { Modal } from '../../ui/Modal'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { CONSTANTS } from '../../utils/constants'

interface PhotoAssemblyProps {
  onComplete: (imageBase64: string, assemblyState: object) => void
  onCancel: () => void
}

export function PhotoAssembly({ onComplete, onCancel }: PhotoAssemblyProps) {
  const { showToast } = useUiStore()
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
  const [separatorWidth, setSeparatorWidth] = useState(4)
  const [pendingZoneIndex, setPendingZoneIndex] = useState<number | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const getOverlapScore = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => {
    const ax2 = a.x + a.width
    const ay2 = a.y + a.height
    const bx2 = b.x + b.width
    const by2 = b.y + b.height
    const overlapX = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x))
    const overlapY = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y))
    const intersection = overlapX * overlapY
    if (intersection === 0) return 0
    const areaA = a.width * a.height
    const areaB = b.width * b.height
    const union = areaA + areaB - intersection
    return union > 0 ? intersection / union : 0
  }

  const buildZoneMapping = (fromTemplate: LayoutTemplate, toTemplate: LayoutTemplate) => {
    const used = new Set<number>()
    return toTemplate.zones.map((zone) => {
      let bestIndex = -1
      let bestScore = 0
      fromTemplate.zones.forEach((oldZone, index) => {
        if (used.has(index)) return
        const score = getOverlapScore(oldZone, zone)
        if (score > bestScore) {
          bestScore = score
          bestIndex = index
        }
      })
      if (bestScore >= 0.45 && bestIndex >= 0) {
        used.add(bestIndex)
        return bestIndex
      }
      return -1
    })
  }

  const handleTemplateSelect = (template: LayoutTemplate) => {
    const previousTemplate = selectedTemplate
    const previousState = stateManager.getState()
    const mapping = buildZoneMapping(previousTemplate, template)
    const newZoneStates = Array(template.zones.length)
      .fill(null)
      .map(() => ({
        photoIndex: -1,
        zoom: 1,
        x: 0,
        y: 0,
        rotation: 0,
      }))

    mapping.forEach((oldIndex, newIndex) => {
      if (oldIndex >= 0 && previousState.zoneStates[oldIndex]) {
        const previousZone = previousState.zoneStates[oldIndex]
        newZoneStates[newIndex] = {
          photoIndex: previousZone.photoIndex,
          zoom: previousZone.zoom,
          x: previousZone.x,
          y: previousZone.y,
          rotation: previousZone.rotation ?? 0,
        }
      }
    })

    setSelectedTemplate(template)
    setStateManager(StateManager.fromState(template.id, previousState.photos, newZoneStates))
    setSelectedZoneIndex(null)
    setCanvasKey((k) => k + 1)
    setStateVersion((v) => v + 1)
    setIsLayoutModalOpen(false)
  }

  const handleCancelRequest = () => {
    const hasPhotos = stateManager.getState().zoneStates.some((zone) => zone.photoIndex >= 0)
    if (hasPhotos) {
      setShowCancelConfirm(true)
      return
    }
    onCancel()
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
    <div className="h-full flex flex-col bg-gray-50 relative">
      {/* Layout bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <div className="text-sm text-gray-600 flex items-center gap-2">
            <span>Layout</span>
            <button
              onClick={() => setIsLayoutModalOpen(true)}
              className="px-2 py-1 rounded-md border border-gray-300 text-xs text-gray-700 hover:border-gray-400"
            >
              Choisir
            </button>
          </div>
          <div className="text-sm font-semibold text-gray-900">
            {selectedTemplate?.name} • {selectedTemplate?.zones.length} photos
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-xs text-gray-500">Épaisseur liseré</span>
            <input
              type="range"
              min={1}
              max={24}
              value={separatorWidth}
              onChange={(e) => setSeparatorWidth(Number(e.target.value))}
              className="w-24 accent-primary-600"
            />
            <span className="text-xs text-gray-600 w-4 text-right">{separatorWidth}</span>
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
            onClick={handleValidate}
            disabled={!stateManager.isComplete()}
            className={`px-3 py-2 rounded-lg text-sm font-medium ${
              stateManager.isComplete()
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            }`}
          >
            Valider
          </button>
          <button
            onClick={handleCancelRequest}
            className="p-2 rounded-full border border-red-200 text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors"
            aria-label="Annuler"
          >
            <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-6">
        <div className="p-4 max-w-3xl mx-auto w-full">
          <AssemblyCanvas
            key={canvasKey}
            template={selectedTemplate}
            stateManager={stateManager}
            selectedZoneIndex={selectedZoneIndex}
            onZoneSelect={handleZoneClick}
            onStateChange={() => setStateVersion((v) => v + 1)}
            stateVersion={stateVersion}
            separatorWidth={separatorWidth}
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

      {/* Footer removed: controls moved to header */}

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

      <ConfirmDialog
        isOpen={showCancelConfirm}
        title="Annuler l'assemblage ?"
        message="Des photos sont déjà placées. Voulez-vous vraiment fermer l'assemblage ?"
        confirmLabel="Annuler"
        cancelLabel="Retour"
        onConfirm={onCancel}
        onCancel={() => setShowCancelConfirm(false)}
        variant="danger"
      />

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
