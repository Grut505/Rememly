import { compressImage } from '../utils/image'

class ImageService {
  async processImage(file: File): Promise<{
    fileName: string
    mimeType: string
    base64: string
  }> {
    const base64 = await compressImage(file)
    return {
      fileName: file.name,
      mimeType: 'image/jpeg',
      base64,
    }
  }

  async processMultipleImages(files: File[]): Promise<{
    fileName: string
    mimeType: string
    base64: string
  }[]> {
    return Promise.all(files.map((file) => this.processImage(file)))
  }
}

export const imageService = new ImageService()
