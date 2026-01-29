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
          rotation: 0,
        })),
    }
  }

  static fromState(templateId: string, photos: File[], zoneStates: ZoneState[]): StateManager {
    const manager = new StateManager(templateId, zoneStates.length)
    manager.state = {
      templateId,
      photos: [...photos],
      zoneStates: zoneStates.map((zone) => ({ ...zone })),
    }
    return manager
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
    transform: { zoom?: number; x?: number; y?: number; rotation?: number }
  ): void {
    if (zoneIndex >= 0 && zoneIndex < this.state.zoneStates.length) {
      const zone = this.state.zoneStates[zoneIndex]
      if (transform.zoom !== undefined) zone.zoom = transform.zoom
      if (transform.x !== undefined) zone.x = transform.x
      if (transform.y !== undefined) zone.y = transform.y
      if (transform.rotation !== undefined) zone.rotation = transform.rotation
    }
  }

  swapZoneStates(a: number, b: number): void {
    if (a === b) return
    if (a < 0 || b < 0) return
    if (a >= this.state.zoneStates.length || b >= this.state.zoneStates.length) return
    const temp = this.state.zoneStates[a]
    this.state.zoneStates[a] = this.state.zoneStates[b]
    this.state.zoneStates[b] = temp
  }

  removePhotoFromZone(zoneIndex: number): void {
    if (zoneIndex >= 0 && zoneIndex < this.state.zoneStates.length) {
      this.state.zoneStates[zoneIndex].photoIndex = -1
      this.state.zoneStates[zoneIndex].zoom = 1
      this.state.zoneStates[zoneIndex].x = 0
      this.state.zoneStates[zoneIndex].y = 0
      this.state.zoneStates[zoneIndex].rotation = 0
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
