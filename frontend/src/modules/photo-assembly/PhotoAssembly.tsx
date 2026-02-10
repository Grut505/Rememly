import { useState, useRef, useEffect, useCallback } from 'react'
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

function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

interface PhotoAssemblyProps {
  onComplete: (imageBase64: string, assemblyState: object) => void
  onCancel: () => void
}

export function PhotoAssembly({ onComplete, onCancel }: PhotoAssemblyProps) {
  const { showToast } = useUiStore()
  const zoneFileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const photoDimRef = useRef<Map<File, { width: number; height: number }>>(new Map())
  const isMobile = isMobileDevice()

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
  const [showAddPhotoMenu, setShowAddPhotoMenu] = useState(false)
  const [showWebcam, setShowWebcam] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [webcamError, setWebcamError] = useState<string>('')

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

  const handleAddPhotoRequest = (zoneIndex: number) => {
    setPendingZoneIndex(zoneIndex)
    if (isMobile) {
      zoneFileInputRef.current?.click()
      return
    }
    setShowAddPhotoMenu(true)
  }

  const handleTakePhoto = useCallback(async () => {
    setWebcamError('')
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      setWebcamError('Webcam not available. Choose from files.')
      return
    }
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      setStream(mediaStream)
      setShowWebcam(true)
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
        }
      }, 100)
    } catch (err) {
      console.error('Error accessing webcam:', err)
      setWebcamError('Webcam not available. Choose from files.')
    }
  }, [])

  const closeWebcam = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      setStream(null)
    }
    setShowWebcam(false)
  }, [stream])

  const captureFromWebcam = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current
      const canvas = canvasRef.current
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(video, 0, 0)
        canvas.toBlob(async (blob) => {
          if (!blob) return
          if (pendingZoneIndex === null) return
          const file = new File([blob], `webcam-${Date.now()}.jpg`, { type: 'image/jpeg' })
          const photoIndex = stateManager.addPhoto(file)
          stateManager.assignPhotoToZone(photoIndex, pendingZoneIndex)
          setSelectedZoneIndex(pendingZoneIndex)
          setPendingZoneIndex(null)
          setCanvasKey((k) => k + 1)
          setStateVersion((v) => v + 1)
          closeWebcam()
        }, 'image/jpeg', 0.9)
      }
    }
  }, [pendingZoneIndex, stateManager, closeWebcam])

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

  const getPhotoDimensions = async (photo: File) => {
    const cached = photoDimRef.current.get(photo)
    if (cached) return cached

    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(photo)
        const dims = { width: bitmap.width, height: bitmap.height }
        bitmap.close()
        photoDimRef.current.set(photo, dims)
        return dims
      } catch (error) {
        // fall through to Image() method
      }
    }

    const img = new Image()
    const url = URL.createObjectURL(photo)
    const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      img.onload = () => resolve({ width: img.width, height: img.height })
      img.onerror = () => reject(new Error('load'))
      img.src = url
    }).catch(() => {
      showToast('Impossible de charger cette photo', 'error')
      return { width: 0, height: 0 }
    })
    URL.revokeObjectURL(url)
    photoDimRef.current.set(photo, dims)
    return dims
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

    const isRotated = Math.abs(rotation % 180) === 90
    const dims = await getPhotoDimensions(photo)
    if (!dims.width || !dims.height) return
    const imgWidth = isRotated ? dims.height : dims.width
    const imgHeight = isRotated ? dims.width : dims.height

    const scale = Math.max(zoneWidth / imgWidth, zoneHeight / imgHeight)
    const nextZoom = Math.min(8, Math.max(0.5, scale))

    stateManager.updateZoneTransform(zoneIndex, { zoom: nextZoom, x: 0, y: 0 })
    handleZoneUpdate()
  }

  const handleFitZoneContain = async (zoneIndex: number) => {
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

    const isRotated = Math.abs(rotation % 180) === 90
    const dims = await getPhotoDimensions(photo)
    if (!dims.width || !dims.height) return
    const imgWidth = isRotated ? dims.height : dims.width
    const imgHeight = isRotated ? dims.width : dims.height

    const scale = Math.min(zoneWidth / imgWidth, zoneHeight / imgHeight)
    const nextZoom = Math.min(8, Math.max(0.1, scale))

    stateManager.updateZoneTransform(zoneIndex, { zoom: nextZoom, x: 0, y: 0 })
    handleZoneUpdate()
  }

  const handleFitZoneWidth = async (zoneIndex: number) => {
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

    const dims = await getPhotoDimensions(photo)
    if (!dims.width || !dims.height) return
    const isRotated = Math.abs(rotation % 180) === 90
    const imgWidth = isRotated ? dims.height : dims.width
    const imgHeight = isRotated ? dims.width : dims.height

    const scale = zoneWidth / imgWidth
    const nextZoom = Math.min(8, Math.max(0.1, scale))

    stateManager.updateZoneTransform(zoneIndex, { zoom: nextZoom, x: 0, y: 0 })
    handleZoneUpdate()
  }

  const handleFitZoneHeight = async (zoneIndex: number) => {
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

    const dims = await getPhotoDimensions(photo)
    if (!dims.width || !dims.height) return
    const isRotated = Math.abs(rotation % 180) === 90
    const imgWidth = isRotated ? dims.height : dims.width
    const imgHeight = isRotated ? dims.width : dims.height

    const scale = zoneHeight / imgHeight
    const nextZoom = Math.min(8, Math.max(0.1, scale))

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

  useEffect(() => {
    const onValidate = () => {
      handleValidate()
    }
    const onCancel = () => {
      handleCancelRequest()
    }
    window.addEventListener('photo-assembly-validate', onValidate)
    window.addEventListener('photo-assembly-cancel', onCancel)
    return () => {
      window.removeEventListener('photo-assembly-validate', onValidate)
      window.removeEventListener('photo-assembly-cancel', onCancel)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }
      photoDimRef.current.clear()
    }
  }, [stream])

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
            handleAddPhotoRequest(zoneIndex)
          }}
          onFitPhoto={handleFitZone}
          onFitPhotoContain={handleFitZoneContain}
          onFitPhotoWidth={handleFitZoneWidth}
          onFitPhotoHeight={handleFitZoneHeight}
          onCenterPhoto={handleCenterZone}
        />
      )}

      {/* Footer removed: controls moved to header */}

      {/* Hidden file input for zone replace */}
      <input
        ref={zoneFileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {!isMobile && (
        <Modal
          isOpen={showAddPhotoMenu}
          onClose={() => setShowAddPhotoMenu(false)}
          title="Add Photo"
          align="center"
        >
          <div className="p-4 space-y-3">
            <button
              type="button"
              className="w-full px-4 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
              onClick={() => {
                setShowAddPhotoMenu(false)
                zoneFileInputRef.current?.click()
              }}
            >
              Choose from files
            </button>
            <button
              type="button"
              className="w-full px-4 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
              onClick={() => {
                setShowAddPhotoMenu(false)
                handleTakePhoto()
              }}
            >
              Use webcam
            </button>
            {webcamError && (
              <div className="text-xs text-gray-500">{webcamError}</div>
            )}
          </div>
        </Modal>
      )}

      {showWebcam && (
        <div className="fixed inset-0 z-[1000] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-4">
            <div className="relative bg-black rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-auto max-h-[60vh] object-contain"
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={captureFromWebcam}
                className="flex-1 px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700"
              >
                Capture
              </button>
              <button
                type="button"
                onClick={closeWebcam}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
                    handleAddPhotoRequest(index)
                    setIsZonesModalOpen(false)
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
