import { useRef, ChangeEvent, useState, useEffect, useCallback } from 'react'
import { Button } from '../../ui/Button'

// Check if device is mobile (PWA native picker already offers camera/gallery/file)
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
  onPhotoAssembly?: () => void
}

export { extractExifDate }

export function PhotoPicker({ onPhotoSelected, currentImage, onPhotoAssembly }: PhotoPickerProps) {
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [showOptions, setShowOptions] = useState(false)
  const [showWebcam, setShowWebcam] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [webcamError, setWebcamError] = useState<string>('')
  const isMobile = isMobileDevice()

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }
    }
  }, [stream])

  useEffect(() => {
    if (!showOptions) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowOptions(false)
      }
    }
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-photo-menu]') || target?.closest('[data-photo-menu-trigger]')) return
      setShowOptions(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('click', onClick)
    }
  }, [showOptions])

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Extract EXIF date from the image
      const exifDate = await extractExifDate(file)
      onPhotoSelected(file, exifDate || undefined)
    }
    // Reset input value to allow selecting the same file again
    e.target.value = ''
  }

  const handleSelectFromGallery = () => {
    galleryInputRef.current?.click()
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
            onPhotoSelected(file, new Date())
            closeWebcam()
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
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Button
                onClick={() => {
                  if (isMobile) {
                    handleSelectFromGallery()
                  } else {
                    setShowOptions((prev) => !prev)
                  }
                }}
                fullWidth
                data-photo-menu-trigger
              >
                Select Photo
              </Button>
              {!isMobile && showOptions && (
                <div
                  data-photo-menu
                  className="absolute left-0 right-0 mt-2 z-20 rounded-xl border border-gray-200 bg-white shadow-lg p-2"
                >
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm"
                    onClick={() => {
                      setShowOptions(false)
                      handleSelectFromGallery()
                    }}
                  >
                    Choose from files
                  </button>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm"
                    onClick={() => {
                      setShowOptions(false)
                      handleTakePhoto()
                    }}
                  >
                    Use webcam
                  </button>
                  {webcamError && (
                    <div className="px-3 py-2 text-xs text-gray-500">
                      {webcamError}
                    </div>
                  )}
                </div>
              )}
            </div>
            {onPhotoAssembly && (
              <Button variant="secondary" onClick={onPhotoAssembly} fullWidth>
                Photo Assembly
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <div className="text-4xl mb-2">📷</div>
          <p className="text-gray-600 mb-4">Add a photo</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <div className="relative">
              <Button
                onClick={() => {
                  if (isMobile) {
                    handleSelectFromGallery()
                  } else {
                    setShowOptions((prev) => !prev)
                  }
                }}
                data-photo-menu-trigger
              >
                Select Photo
              </Button>
              {!isMobile && showOptions && (
                <div
                  data-photo-menu
                  className="absolute left-0 right-0 mt-2 z-20 rounded-xl border border-gray-200 bg-white shadow-lg p-2"
                >
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm"
                    onClick={() => {
                      setShowOptions(false)
                      handleSelectFromGallery()
                    }}
                  >
                    Choose from files
                  </button>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm"
                    onClick={() => {
                      setShowOptions(false)
                      handleTakePhoto()
                    }}
                  >
                    Use webcam
                  </button>
                  {webcamError && (
                    <div className="px-3 py-2 text-xs text-gray-500">
                      {webcamError}
                    </div>
                  )}
                </div>
              )}
            </div>
            {onPhotoAssembly && (
              <Button variant="secondary" onClick={onPhotoAssembly}>
                Photo Assembly
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
