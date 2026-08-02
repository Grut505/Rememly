import { useState, useRef, useEffect, useCallback } from 'react'
import { DEFAULT_LAYOUT, LayoutTemplate } from './layoutRegistry'
import { StateManager } from './StateManager'
import { TemplateSelector } from './TemplateSelector'
import { AssemblyCanvas, AssemblyCanvasHandle } from './AssemblyCanvas'
import { ZoneController } from './ZoneController'
import { ZoneFineEditor } from './ZoneFineEditor'
import { canvasToBase64 } from '../../utils/image'
import { useUiStore } from '../../state/uiStore'
import { Modal } from '../../ui/Modal'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { CONSTANTS } from '../../utils/constants'
import { getPhotoDate } from '../../utils/exifDate'
import { Slider } from '../../ui/Slider'
import { getEffectiveRect } from './zoneGeometry'

function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

interface PhotoAssemblyProps {
  onComplete: (imageBase64: string, assemblyState: object, lastPhotoDate?: string) => void
  onCancel: () => void
}

export function PhotoAssembly({ onComplete, onCancel }: PhotoAssemblyProps) {
  const { showToast } = useUiStore()
  const zoneFileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const assemblyCanvasRef = useRef<AssemblyCanvasHandle>(null)
  const photoDimRef = useRef<Map<File, { width: number; height: number }>>(new Map())
  const isMobile = isMobileDevice()

  const [selectedTemplate, setSelectedTemplate] = useState<LayoutTemplate>(DEFAULT_LAYOUT)
  const [stateManager, setStateManager] = useState<StateManager>(
    () => new StateManager(DEFAULT_LAYOUT.id, DEFAULT_LAYOUT.zones.length)
  )
  const [selectedZoneIndex, setSelectedZoneIndex] = useState<number | null>(null)
  const [canvasKey, setCanvasKey] = useState(0)
  const [stateVersion, setStateVersion] = useState(0)
  const [isLayoutModalOpen, setIsLayoutModalOpen] = useState(false)
  const [separatorWidth, setSeparatorWidth] = useState(4)
  const [showOuterBorder, setShowOuterBorder] = useState(true)
  const [pendingZoneIndex, setPendingZoneIndex] = useState<number | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showAddPhotoMenu, setShowAddPhotoMenu] = useState(false)
  const [showWebcam, setShowWebcam] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [webcamError, setWebcamError] = useState<string>('')
  const [lastPhotoDate, setLastPhotoDate] = useState<Date | null>(null)
  const [fineAdjustZoneIndex, setFineAdjustZoneIndex] = useState<number | null>(null)
  const [selectedZoneFormat, setSelectedZoneFormat] = useState<string>('')

  const trackPhotoDate = (file: File) => {
    getPhotoDate(file).then((date) => setLastPhotoDate(date))
  }

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

  const handleTemplateSelect = async (template: LayoutTemplate) => {
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

    const carriedOverZones: number[] = []
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
        carriedOverZones.push(newIndex)
      }
    })

    const newManager = StateManager.fromState(template.id, previousState.photos, newZoneStates)

    // A carried-over photo's zoom/position was computed to cover the OLD
    // zone's shape - the new template's zone for it is very likely a
    // different size/aspect ratio, so keeping that zoom as-is can leave gaps
    // or an oddly cropped/zoomed-looking result ("stretch" complaints were
    // actually this, not literal non-uniform scaling). Re-fit (cover) each
    // carried-over zone against its new dimensions before this becomes the
    // active state, so the switch always looks clean.
    const { width: canvasWidth, height: canvasHeight } = getCanvasSize(template)
    await Promise.all(carriedOverZones.map(async (newIndex) => {
      const photo = newManager.getPhotoForZone(newIndex)
      const zone = template.zones[newIndex]
      if (!photo || !zone) return
      const dims = await getPhotoDimensions(photo)
      if (!dims.width || !dims.height) return
      const rotation = newManager.getState().zoneStates[newIndex].rotation || 0
      const isRotated = Math.abs(rotation % 180) === 90
      const imgWidth = isRotated ? dims.height : dims.width
      const imgHeight = isRotated ? dims.width : dims.height
      const zoneWidth = (zone.width / 100) * canvasWidth
      const zoneHeight = (zone.height / 100) * canvasHeight
      const scale = Math.max(zoneWidth / imgWidth, zoneHeight / imgHeight)
      const nextZoom = Math.min(8, Math.max(0.5, scale))
      newManager.updateZoneTransform(newIndex, { zoom: nextZoom, x: 0, y: 0 })
    }))

    setSelectedTemplate(template)
    setStateManager(newManager)
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

    const zonesToFit: number[] = []

    if (pendingZoneIndex !== null) {
      const file = files[0]
      const photoIndex = stateManager.addPhoto(file)
      stateManager.assignPhotoToZone(photoIndex, pendingZoneIndex)
      trackPhotoDate(file)
      zonesToFit.push(pendingZoneIndex)
      setSelectedZoneIndex(pendingZoneIndex)
      setPendingZoneIndex(null)
    } else {
      // Fill empty zones first (in order), then - since "Add multiple" means
      // "place these photos", not "top up whatever's left" - replace already-
      // occupied zones (also in order) with any remaining files, rather than
      // silently dropping them once every zone already has a photo.
      const occupiedZoneIndices = state.zoneStates
        .map((zone, index) => (zone.photoIndex >= 0 ? index : null))
        .filter((index): index is number => index !== null)
      const targetZoneIndices = [...emptyZoneIndices, ...occupiedZoneIndices]

      let assigned = 0
      let replaced = 0
      targetZoneIndices.forEach((zoneIndex, idx) => {
        const file = files[idx]
        if (!file) return
        if (idx >= emptyZoneIndices.length) replaced += 1
        const photoIndex = stateManager.addPhoto(file)
        stateManager.assignPhotoToZone(photoIndex, zoneIndex)
        trackPhotoDate(file)
        zonesToFit.push(zoneIndex)
        assigned += 1
      })
      if (files.length > assigned) {
        showToast(`${files.length - assigned} photo(s) skipped (not enough zones)`, 'info')
      } else if (replaced > 0) {
        showToast(`${replaced} existing photo(s) replaced`, 'info')
      }
    }

    setCanvasKey((k) => k + 1)
    setStateVersion((v) => v + 1)

    // Newly added photos default to auto-fit (cover) so the zone is filled
    // right away instead of showing the photo at its native 1x zoom.
    Promise.all(zonesToFit.map((zoneIndex) => handleFitZone(zoneIndex))).then(() => {
      setCanvasKey((k) => k + 1)
      setStateVersion((v) => v + 1)
    })

    // Clear input
    e.target.value = ''
  }

  const handleAddPhotoRequest = (zoneIndex: number) => {
    setPendingZoneIndex(zoneIndex)
    if (zoneFileInputRef.current) zoneFileInputRef.current.multiple = false
    if (isMobile) {
      zoneFileInputRef.current?.click()
      return
    }
    setShowAddPhotoMenu(true)
  }

  const handleAddMultiplePhotosRequest = () => {
    setPendingZoneIndex(null)
    if (zoneFileInputRef.current) zoneFileInputRef.current.multiple = true
    zoneFileInputRef.current?.click()
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
          const zoneIndex = pendingZoneIndex
          setSelectedZoneIndex(zoneIndex)
          setPendingZoneIndex(null)
          setCanvasKey((k) => k + 1)
          setStateVersion((v) => v + 1)
          handleFitZone(zoneIndex).then(() => {
            setCanvasKey((k) => k + 1)
            setStateVersion((v) => v + 1)
          })
          closeWebcam()
        }, 'image/jpeg', 0.9)
      }
    }
  }, [pendingZoneIndex, stateManager, closeWebcam])

  const handleZoneClick = (zoneIndex: number) => {
    setSelectedZoneIndex((prev) => (prev === zoneIndex ? null : zoneIndex))
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

  const handleFineAdjustApply = (transform: { zoom: number; x: number; y: number; rotation: number }) => {
    if (fineAdjustZoneIndex === null) return
    stateManager.updateZoneTransform(fineAdjustZoneIndex, transform)
    setFineAdjustZoneIndex(null)
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

  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

  useEffect(() => {
    if (selectedZoneIndex === null) {
      setSelectedZoneFormat('')
      return
    }
    const photo = stateManager.getPhotoForZone(selectedZoneIndex)
    if (!photo) {
      setSelectedZoneFormat('')
      return
    }
    let cancelled = false
    getPhotoDimensions(photo).then(({ width, height }) => {
      if (cancelled || !width || !height) return
      const divisor = gcd(width, height)
      setSelectedZoneFormat(`${width} × ${height} px · ${width / divisor}:${height / divisor}`)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedZoneIndex, stateVersion])

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
    const rect = getEffectiveRect(zone, stateManager.getState().zoneStates[zoneIndex])
    const zoneWidth = (rect.width / 100) * canvasWidth
    const zoneHeight = (rect.height / 100) * canvasHeight

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
    const rect = getEffectiveRect(zone, stateManager.getState().zoneStates[zoneIndex])
    const zoneWidth = (rect.width / 100) * canvasWidth
    const zoneHeight = (rect.height / 100) * canvasHeight

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
    const rect = getEffectiveRect(zone, stateManager.getState().zoneStates[zoneIndex])
    const zoneWidth = (rect.width / 100) * canvasWidth
    const zoneHeight = (rect.height / 100) * canvasHeight

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
    const rect = getEffectiveRect(zone, stateManager.getState().zoneStates[zoneIndex])
    const zoneWidth = (rect.width / 100) * canvasWidth
    const zoneHeight = (rect.height / 100) * canvasHeight

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
    try {
      window.dispatchEvent(new CustomEvent('photo-assembly-validating', { detail: { loading: true } }))
      // Re-render at full resolution from the original photo files, rather
      // than grabbing the live editing canvas - that canvas draws from
      // capped-size in-editor bitmaps (kept small to avoid crashing iOS PWAs
      // when many photos are loaded at once), which would make the saved
      // image soft/blurry for zones larger than that cap.
      if (!assemblyCanvasRef.current) {
        showToast('Failed to generate image', 'error')
        return
      }

      const canvas = await assemblyCanvasRef.current.renderFullResolution()
      const imageBase64 = await canvasToBase64(canvas, 0.9)
      const assemblyState = stateManager.serialize()

      onComplete(imageBase64, assemblyState, lastPhotoDate ? lastPhotoDate.toISOString() : undefined)
    } catch (error) {
      showToast('Failed to create assembly', 'error')
    }
  }

  const lastTemplateIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!selectedTemplate?.id) return
    if (lastTemplateIdRef.current !== selectedTemplate.id) {
      lastTemplateIdRef.current = selectedTemplate.id
      if (selectedTemplate.zones?.length) {
        setSelectedZoneIndex(0)
      }
    }
  }, [selectedTemplate])

  // handleValidate/handleCancelRequest close over stateManager, which is
  // replaced (new instance) whenever the layout changes. The window
  // listeners below are only ever registered once (empty deps, so the
  // effect never re-runs), so without these refs they'd keep calling the
  // very first render's closures forever - checking a stateManager that's
  // stale as soon as the user picks a different layout, which made Confirm
  // always fail with "Please fill all zones" even when every zone was filled.
  const handleValidateRef = useRef(handleValidate)
  handleValidateRef.current = handleValidate
  const handleCancelRequestRef = useRef(handleCancelRequest)
  handleCancelRequestRef.current = handleCancelRequest

  useEffect(() => {
    const onValidate = () => {
      handleValidateRef.current()
    }
    const onCancel = () => {
      handleCancelRequestRef.current()
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
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-600">Layout</span>
          <button
            onClick={() => setIsLayoutModalOpen(true)}
            className="px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 hover:border-gray-400 touch-manipulation"
          >
            Choose
          </button>
          <span className="text-sm font-semibold text-gray-900">
            {selectedTemplate?.name} • {selectedTemplate?.zones.length} photos
          </span>
        </div>
        <Slider
          label="Border thickness"
          min={1}
          max={50}
          value={separatorWidth}
          onChange={setSeparatorWidth}
          className="mt-2 max-w-xs"
        />
        <label className="mt-2 flex items-center gap-2 text-sm text-gray-600 cursor-pointer touch-manipulation w-fit">
          <input
            type="checkbox"
            checked={showOuterBorder}
            onChange={(e) => setShowOuterBorder(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          Show outer border
        </label>
      </div>

      {/* Content */}
      {/* Extra bottom padding when a zone is selected so the fixed
          ZoneController bar (icons + zoom slider + close/revert, ~11rem)
          never covers content like the "Add multiple" button. */}
      <div className={`flex-1 overflow-y-auto ${selectedZoneIndex !== null ? 'pb-44' : 'pb-6'}`}>
        <div className="p-4 max-w-3xl mx-auto w-full">
          <AssemblyCanvas
            ref={assemblyCanvasRef}
            key={canvasKey}
            template={selectedTemplate}
            stateManager={stateManager}
            selectedZoneIndex={selectedZoneIndex}
            onZoneSelect={handleZoneClick}
            onZoneDoubleClick={(zoneIndex) => {
              setSelectedZoneIndex(zoneIndex)
              handleAddPhotoRequest(zoneIndex)
            }}
            onStateChange={() => setStateVersion((v) => v + 1)}
            stateVersion={stateVersion}
            separatorWidth={separatorWidth}
            showOuterBorder={showOuterBorder}
          />
          {(selectedTemplate?.zones.length ?? 0) > 1 && (
            <div className="flex justify-center mt-3">
              <button
                onClick={handleAddMultiplePhotosRequest}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:border-gray-400"
              >
                Add multiple
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Zone Controller */}
      {selectedZoneIndex !== null && (
        <ZoneController
          zoneIndex={selectedZoneIndex}
          stateManager={stateManager}
          photoFormatLabel={selectedZoneFormat}
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
          onFineAdjust={setFineAdjustZoneIndex}
        />
      )}

      {fineAdjustZoneIndex !== null && (() => {
        const photo = stateManager.getPhotoForZone(fineAdjustZoneIndex)
        const zone = selectedTemplate.zones[fineAdjustZoneIndex]
        const zoneState = stateManager.getState().zoneStates[fineAdjustZoneIndex]
        if (!photo || !zone) return null
        const { width: canvasWidth, height: canvasHeight } = getCanvasSize(selectedTemplate)
        const rect = getEffectiveRect(zone, zoneState)
        return (
          <ZoneFineEditor
            photo={photo}
            zoom={zoneState.zoom}
            x={zoneState.x}
            y={zoneState.y}
            rotation={zoneState.rotation || 0}
            realZoneWidthPx={(rect.width / 100) * canvasWidth}
            realZoneHeightPx={(rect.height / 100) * canvasHeight}
            onApply={handleFineAdjustApply}
            onClose={() => setFineAdjustZoneIndex(null)}
          />
        )
      })()}

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
        title="Choose a layout"
      >
        <TemplateSelector
          selectedTemplateId={selectedTemplate.id}
          onSelect={handleTemplateSelect}
        />
      </Modal>

      <ConfirmDialog
        isOpen={showCancelConfirm}
        title="Cancel assembly?"
        message="Photos have already been placed. Are you sure you want to close the assembly?"
        confirmLabel="Cancel"
        cancelLabel="Back"
        onConfirm={onCancel}
        onCancel={() => setShowCancelConfirm(false)}
        variant="danger"
      />
    </div>
  )
}
