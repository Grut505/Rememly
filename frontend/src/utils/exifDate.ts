// Extract EXIF date from a JPEG file. Returns null for non-JPEG formats
// (e.g. HEIC, the default iPhone photo format) since they don't share
// JPEG's magic bytes / EXIF container layout parsed here.
export async function extractExifDate(file: File): Promise<Date | null> {
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

// Best-effort photo date: tries EXIF first (JPEG only), then falls back to
// the file's last-modified timestamp so HEIC and other formats still get a
// sensible date instead of silently doing nothing.
export async function getPhotoDate(file: File): Promise<Date> {
  const exifDate = await extractExifDate(file)
  return exifDate || new Date(file.lastModified)
}
