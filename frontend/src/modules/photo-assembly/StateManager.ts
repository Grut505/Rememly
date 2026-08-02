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

  updateZoneRect(zoneIndex: number, rect: { x: number; y: number; width: number; height: number } | undefined): void {
    if (zoneIndex >= 0 && zoneIndex < this.state.zoneStates.length) {
      this.state.zoneStates[zoneIndex].rect = rect
    }
  }

  // Swaps the PHOTO placement (photoIndex/zoom/x/y/rotation) between two
  // zones, but not each zone's own `rect` or `zIndex` - those belong to the
  // block's shape/stacking position, which stay put regardless of which
  // photo ends up there.
  swapZoneStates(a: number, b: number): void {
    if (a === b) return
    if (a < 0 || b < 0) return
    if (a >= this.state.zoneStates.length || b >= this.state.zoneStates.length) return
    const zoneA = this.state.zoneStates[a]
    const zoneB = this.state.zoneStates[b]
    const { rect: rectA, zIndex: zIndexA, ...placementA } = zoneA
    const { rect: rectB, zIndex: zIndexB, ...placementB } = zoneB
    this.state.zoneStates[a] = { ...placementB, rect: rectA, zIndex: zIndexA }
    this.state.zoneStates[b] = { ...placementA, rect: rectB, zIndex: zIndexB }
  }

  // Zones are drawn back-to-front in this order (lower zIndex = further
  // back); zones without an explicit zIndex default to their own array
  // index, i.e. the original template/draw order.
  getDrawOrder(): number[] {
    return this.state.zoneStates
      .map((zone, index) => ({ index, z: zone.zIndex ?? index }))
      .sort((a, b) => a.z - b.z || a.index - b.index)
      .map((entry) => entry.index)
  }

  private normalizeZIndices(order: number[]): void {
    order.forEach((zoneIndex, position) => {
      this.state.zoneStates[zoneIndex].zIndex = position
    })
  }

  canBringZoneForward(zoneIndex: number): boolean {
    const order = this.getDrawOrder()
    return order.indexOf(zoneIndex) < order.length - 1
  }

  canSendZoneBackward(zoneIndex: number): boolean {
    return this.getDrawOrder().indexOf(zoneIndex) > 0
  }

  bringZoneForward(zoneIndex: number): void {
    const order = this.getDrawOrder()
    const pos = order.indexOf(zoneIndex)
    if (pos === -1 || pos === order.length - 1) return
    ;[order[pos], order[pos + 1]] = [order[pos + 1], order[pos]]
    this.normalizeZIndices(order)
  }

  sendZoneBackward(zoneIndex: number): void {
    const order = this.getDrawOrder()
    const pos = order.indexOf(zoneIndex)
    if (pos <= 0) return
    ;[order[pos], order[pos - 1]] = [order[pos - 1], order[pos]]
    this.normalizeZIndices(order)
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

  serialize(): object {
    return {
      templateId: this.state.templateId,
      zoneStates: this.state.zoneStates,
    }
  }
}
