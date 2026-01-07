import { ZoneState } from '../../api/types'

export interface AssemblyStateData {
  templateId: string
  photos: File[]
  zoneStates: ZoneState[]
}

export class StateManager {
  private state: AssemblyStateData

  constructor(templateId: string, zoneCount: number) {
    this.state = {
      templateId,
      photos: [],
      zoneStates: Array(zoneCount)
        .fill(null)
        .map(() => ({
          photoIndex: -1,
          zoom: 1,
          x: 0,
          y: 0,
        })),
    }
  }

  addPhoto(photo: File): number {
    this.state.photos.push(photo)
    return this.state.photos.length - 1
  }

  assignPhotoToZone(photoIndex: number, zoneIndex: number): void {
    if (zoneIndex >= 0 && zoneIndex < this.state.zoneStates.length) {
      this.state.zoneStates[zoneIndex].photoIndex = photoIndex
    }
  }

  updateZoneTransform(
    zoneIndex: number,
    transform: { zoom?: number; x?: number; y?: number }
  ): void {
    if (zoneIndex >= 0 && zoneIndex < this.state.zoneStates.length) {
      const zone = this.state.zoneStates[zoneIndex]
      if (transform.zoom !== undefined) zone.zoom = transform.zoom
      if (transform.x !== undefined) zone.x = transform.x
      if (transform.y !== undefined) zone.y = transform.y
    }
  }

  getState(): AssemblyStateData {
    return { ...this.state }
  }

  getPhotoForZone(zoneIndex: number): File | null {
    const zone = this.state.zoneStates[zoneIndex]
    if (zone.photoIndex >= 0 && zone.photoIndex < this.state.photos.length) {
      return this.state.photos[zone.photoIndex]
    }
    return null
  }

  isComplete(): boolean {
    return this.state.zoneStates.every((zone) => zone.photoIndex >= 0)
  }

  serialize(): object {
    return {
      templateId: this.state.templateId,
      zoneStates: this.state.zoneStates,
    }
  }
}
