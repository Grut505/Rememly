import { CONSTANTS } from './constants'

export async function compressImage(
  file: File,
  maxWidth: number = CONSTANTS.TARGET_IMAGE_WIDTH_PX
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      const img = new Image()

      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        // Resize if needed
        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, width, height)

        // Get base64 with compression
        const base64 = canvas.toDataURL('image/jpeg', 0.85)
        resolve(base64.split(',')[1])
      }

      img.onerror = reject
      img.src = e.target?.result as string
    }

    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function getBase64FromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function canvasToBase64(
  canvas: HTMLCanvasElement,
  quality: number = 0.9
): Promise<string> {
  return new Promise((resolve) => {
    canvas.toBlob(
      async (blob) => {
        if (blob) {
          const base64 = await getBase64FromBlob(blob)
          resolve(base64)
        }
      },
      'image/jpeg',
      quality
    )
  })
}

export function getImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.width, height: img.height })
    }

    img.onerror = reject
    img.src = url
  })
}
