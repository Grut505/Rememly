import { useRef, ChangeEvent } from 'react'
import { Button } from '../../ui/Button'

// Convert old Drive URLs to new embeddable format
function convertDriveUrl(url: string): string {
  if (!url) return url

  // If already in thumbnail format, return as-is
  if (url.includes('drive.google.com/thumbnail')) {
    return url
  }

  // Extract file ID from various Drive URL formats
  const patterns = [
    /drive\.google\.com\/file\/d\/([^\/]+)/,
    /drive\.google\.com\/uc\?.*[&?]id=([^&]+)/,
    /drive\.google\.com\/open\?.*[&?]id=([^&]+)/,
    /lh3\.googleusercontent\.com\/d\/([^?&]+)/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match && match[1]) {
      return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w2000`
    }
  }

  // If not a Drive URL, return as-is
  return url
}

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
            src={convertDriveUrl(currentImage)}
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
