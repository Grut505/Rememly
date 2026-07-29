// Convert old Drive URLs to new embeddable format
function convertDriveUrl(url: string): string {
  if (!url) {
    console.warn('Empty image URL provided to PhotoPicker')
    return ''
  }

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

  // If not a Drive URL, return as-is (could be data URL or other format)
  return url
}

interface PhotoPickerProps {
  currentImage?: string
  onPhotoAssembly: () => void
}

// Tapping the current image or the placeholder opens the Photo Assembly
// panel directly - there is no separate file/webcam picker anymore, Assembly
// handles all photo selection.
export function PhotoPicker({ currentImage, onPhotoAssembly }: PhotoPickerProps) {
  return (
    <div className="w-full">
      {currentImage ? (
        <button
          type="button"
          onClick={onPhotoAssembly}
          className="relative w-full block rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <img
            src={convertDriveUrl(currentImage)}
            alt="Selected"
            className="w-full h-auto max-h-[40vh] object-contain"
          />
        </button>
      ) : (
        <button
          type="button"
          onClick={onPhotoAssembly}
          className="w-full border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:bg-gray-50 hover:border-gray-400 transition-colors"
        >
          <div className="text-4xl mb-2">📷</div>
          <p className="text-gray-600">Add a photo</p>
        </button>
      )}
    </div>
  )
}
