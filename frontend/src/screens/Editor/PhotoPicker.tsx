import { useRef, ChangeEvent } from 'react'
import { Button } from '../../ui/Button'

interface PhotoPickerProps {
  onPhotoSelected: (file: File) => void
  currentImage?: string
}

export function PhotoPicker({ onPhotoSelected, currentImage }: PhotoPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onPhotoSelected(file)
    }
  }

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      {currentImage ? (
        <div className="relative">
          <img
            src={currentImage}
            alt="Selected"
            className="w-full h-auto rounded-lg"
          />
          <div className="mt-4 flex gap-2">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => fileInputRef.current?.click()}
            >
              Change Photo
            </Button>
          </div>
        </div>
      ) : (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <div className="text-4xl mb-2">📷</div>
          <p className="text-gray-600 mb-4">Add a photo</p>
          <Button onClick={() => fileInputRef.current?.click()}>
            Select Photo
          </Button>
        </div>
      )}
    </div>
  )
}
