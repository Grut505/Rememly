import { useRef, ChangeEvent, useState, useEffect, useCallback } from 'react'
import { Button } from '../../ui/Button'

// Check if device has camera capability (mobile or desktop with webcam)
function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

// Extract EXIF date from image file
async function extractExifDate(file: File): Promise<Date | null> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const view = new DataView(e.target?.result as ArrayBuffer)

        // Check for JPEG marker
        if (view.getUint16(0, false) !== 0xFFD8) {
          resolve(null)
          return
        }

        let offset = 2
        const length = view.byteLength

        while (offset < length) {
          if (view.getUint8(offset) !== 0xFF) {
            resolve(null)
            return
          }

          const marker = view.getUint8(offset + 1)

          // APP1 marker (EXIF)
          if (marker === 0xE1) {
            const exifLength = view.getUint16(offset + 2, false)
            const exifData = new DataView(e.target?.result as ArrayBuffer, offset + 4, exifLength - 2)

            // Check for "Exif" header
            const exifHeader = String.fromCharCode(
              exifData.getUint8(0), exifData.getUint8(1),
              exifData.getUint8(2), exifData.getUint8(3)
            )

            if (exifHeader !== 'Exif') {
              resolve(null)
              return
            }

            // Get byte order (II = little endian, MM = big endian)
            const tiffOffset = 6
            const littleEndian = exifData.getUint16(tiffOffset, false) === 0x4949

            // Get IFD0 offset
            const ifdOffset = exifData.getUint32(tiffOffset + 4, littleEndian)
            const numEntries = exifData.getUint16(tiffOffset + ifdOffset, littleEndian)

            // Search for DateTimeOriginal (0x9003) or DateTime (0x0132)
            for (let i = 0; i < numEntries; i++) {
              const entryOffset = tiffOffset + ifdOffset + 2 + (i * 12)
              const tag = exifData.getUint16(entryOffset, littleEndian)

              // Check for EXIF IFD pointer (0x8769)
              if (tag === 0x8769) {
                const exifIfdOffset = exifData.getUint32(entryOffset + 8, littleEndian)
                const exifNumEntries = exifData.getUint16(tiffOffset + exifIfdOffset, littleEndian)

                for (let j = 0; j < exifNumEntries; j++) {
                  const exifEntryOffset = tiffOffset + exifIfdOffset + 2 + (j * 12)
                  const exifTag = exifData.getUint16(exifEntryOffset, littleEndian)

                  // DateTimeOriginal (0x9003) or DateTimeDigitized (0x9004)
                  if (exifTag === 0x9003 || exifTag === 0x9004) {
                    const valueOffset = exifData.getUint32(exifEntryOffset + 8, littleEndian)
                    let dateStr = ''
                    for (let k = 0; k < 19; k++) {
                      dateStr += String.fromCharCode(exifData.getUint8(tiffOffset + valueOffset + k))
                    }
                    // Format: "YYYY:MM:DD HH:MM:SS"
                    const parsed = dateStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
                    const date = new Date(parsed)
                    if (!isNaN(date.getTime())) {
                      resolve(date)
                      return
                    }
                  }
                }
              }

              // DateTime (0x0132) as fallback
              if (tag === 0x0132) {
                const valueOffset = exifData.getUint32(entryOffset + 8, littleEndian)
                let dateStr = ''
                for (let k = 0; k < 19; k++) {
                  dateStr += String.fromCharCode(exifData.getUint8(tiffOffset + valueOffset + k))
                }
                const parsed = dateStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
                const date = new Date(parsed)
                if (!isNaN(date.getTime())) {
                  resolve(date)
                  return
                }
              }
            }

            resolve(null)
            return
          }

          // Skip to next marker
          offset += 2 + view.getUint16(offset + 2, false)
        }

        resolve(null)
      } catch {
        resolve(null)
      }
    }
    reader.onerror = () => resolve(null)
    reader.readAsArrayBuffer(file)
  })
}

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
  onPhotoSelected: (file: File, exifDate?: Date) => void
  currentImage?: string
}

export { extractExifDate }

export function PhotoPicker({ onPhotoSelected, currentImage }: PhotoPickerProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [showOptions, setShowOptions] = useState(false)
  const [showWebcam, setShowWebcam] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)

  const isMobile = isMobileDevice()

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }
    }
  }, [stream])

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Extract EXIF date from the image
      const exifDate = await extractExifDate(file)
      onPhotoSelected(file, exifDate || undefined)
      setShowOptions(false)
    }
    // Reset input value to allow selecting the same file again
    e.target.value = ''
  }

  const handleTakePhoto = useCallback(async () => {
    if (isMobile) {
      // On mobile, use native camera
      cameraInputRef.current?.click()
    } else {
      // On desktop, open webcam
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
        })
        setStream(mediaStream)
        setShowWebcam(true)
        // Wait for video element to be available
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.srcObject = mediaStream
          }
        }, 100)
      } catch (err) {
        console.error('Error accessing webcam:', err)
        // Fallback to file input if webcam not available
        cameraInputRef.current?.click()
      }
    }
  }, [isMobile])

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
          if (blob) {
            const file = new File([blob], `webcam-${Date.now()}.jpg`, { type: 'image/jpeg' })
            onPhotoSelected(file, new Date()) // Use current date for webcam photos
            closeWebcam()
            setShowOptions(false)
          }
        }, 'image/jpeg', 0.9)
      }
    }
  }, [onPhotoSelected])

  const closeWebcam = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      setStream(null)
    }
    setShowWebcam(false)
  }, [stream])

  const handleSelectFromGallery = () => {
    galleryInputRef.current?.click()
  }

  // Webcam modal
  if (showWebcam) {
    return (
      <div className="w-full">
        <div className="relative bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-auto max-h-[50vh] object-contain"
          />
          <canvas ref={canvasRef} className="hidden" />
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={captureFromWebcam} fullWidth>
            Capture
          </Button>
          <Button variant="secondary" onClick={closeWebcam} fullWidth>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      {/* Camera input - with capture attribute (for mobile) */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      {/* Gallery input - without capture attribute */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {currentImage ? (
        <div className="relative">
          <img
            src={convertDriveUrl(currentImage)}
            alt="Selected"
            className="w-full h-auto rounded-lg max-h-[40vh] object-contain"
          />
          <div className="mt-4 flex gap-2">
            <Button
              variant="secondary"
              fullWidth
              onClick={handleTakePhoto}
            >
              Take Photo
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onClick={handleSelectFromGallery}
            >
              Gallery
            </Button>
          </div>
        </div>
      ) : (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <div className="text-4xl mb-2">📷</div>
          <p className="text-gray-600 mb-4">Add a photo</p>
          {showOptions ? (
            <div className="flex flex-col gap-2">
              <Button onClick={handleTakePhoto} fullWidth>
                Take Photo
              </Button>
              <Button variant="secondary" onClick={handleSelectFromGallery} fullWidth>
                Choose from Gallery
              </Button>
              <button
                onClick={() => setShowOptions(false)}
                className="text-sm text-gray-500 mt-2"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex justify-center">
              <Button onClick={() => setShowOptions(true)}>
                Select Photo
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
