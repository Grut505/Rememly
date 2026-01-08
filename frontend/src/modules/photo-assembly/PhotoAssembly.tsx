import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Template, TEMPLATES } from './templates'
import { StateManager } from './StateManager'
import { TemplateSelector } from './TemplateSelector'
import { AssemblyCanvas } from './AssemblyCanvas'
import { ZoneController } from './ZoneController'
import { Toolbar } from './Toolbar'
import { canvasToBase64 } from '../../utils/image'
import { useUiStore } from '../../state/uiStore'

interface PhotoAssemblyProps {
  onComplete: (imageBase64: string, assemblyState: object) => void
  onCancel: () => void
}

export function PhotoAssembly({ onComplete, onCancel }: PhotoAssemblyProps) {
  const navigate = useNavigate()
  const { showToast } = useUiStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedTemplate, setSelectedTemplate] = useState<Template>(TEMPLATES[0])
  const [stateManager, setStateManager] = useState<StateManager>(
    () => new StateManager(TEMPLATES[0].id, TEMPLATES[0].zones.length)
  )
  const [selectedZoneIndex, setSelectedZoneIndex] = useState<number | null>(null)
  const [canvasKey, setCanvasKey] = useState(0)

  const handleTemplateSelect = (template: Template) => {
    setSelectedTemplate(template)
    setStateManager(new StateManager(template.id, template.zones.length))
    setSelectedZoneIndex(null)
    setCanvasKey((k) => k + 1)
  }

  const handleAddPhoto = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const file = files[0]
    const photoIndex = stateManager.addPhoto(file)

    // Auto-assign to first empty zone
    const state = stateManager.getState()
    const emptyZoneIndex = state.zoneStates.findIndex(
      (zone) => zone.photoIndex === -1
    )

    if (emptyZoneIndex >= 0) {
      stateManager.assignPhotoToZone(photoIndex, emptyZoneIndex)
      setCanvasKey((k) => k + 1)
    }

    // Clear input
    e.target.value = ''
  }

  const handleZoneClick = (zoneIndex: number) => {
    setSelectedZoneIndex(zoneIndex)
  }

  const handleZoneUpdate = () => {
    setCanvasKey((k) => k + 1)
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

      {/* Content */}
      <div className="flex-1 pb-32">
        <TemplateSelector
          selectedTemplateId={selectedTemplate.id}
          onSelect={handleTemplateSelect}
        />

        <div className="p-4">
          <AssemblyCanvas
            key={canvasKey}
            template={selectedTemplate}
            stateManager={stateManager}
            onZoneClick={handleZoneClick}
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
        />
      )}

      {/* Toolbar */}
      <Toolbar
        onAddPhoto={handleAddPhoto}
        onValidate={handleValidate}
        onCancel={onCancel}
        isValid={stateManager.isComplete()}
      />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  )
}
