export interface Template {
  id: string
  name: string
  zones: ZoneDefinition[]
}

export interface ZoneDefinition {
  x: number // percentage
  y: number // percentage
  width: number // percentage
  height: number // percentage
}

export const TEMPLATES: Template[] = [
  {
    id: '2x1-vertical',
    name: '2×1 Vertical',
    zones: [
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 0, y: 50, width: 100, height: 50 },
    ],
  },
  {
    id: '2x1-horizontal',
    name: '2×1 Horizontal',
    zones: [
      { x: 0, y: 0, width: 50, height: 100 },
      { x: 50, y: 0, width: 50, height: 100 },
    ],
  },
  {
    id: '4x4-grid',
    name: '4×4 Grid',
    zones: [
      { x: 0, y: 0, width: 50, height: 50 },
      { x: 50, y: 0, width: 50, height: 50 },
      { x: 0, y: 50, width: 50, height: 50 },
      { x: 50, y: 50, width: 50, height: 50 },
    ],
  },
  {
    id: '3-plus-2',
    name: '3 + 2',
    zones: [
      { x: 0, y: 0, width: 100, height: 33.33 },
      { x: 0, y: 33.33, width: 100, height: 33.33 },
      { x: 0, y: 66.66, width: 50, height: 33.34 },
      { x: 50, y: 66.66, width: 50, height: 33.34 },
    ],
  },
  {
    id: '3-plus-2-plus-2',
    name: '3 + 2 + 2',
    zones: [
      { x: 0, y: 0, width: 100, height: 40 },
      { x: 0, y: 40, width: 50, height: 30 },
      { x: 50, y: 40, width: 50, height: 30 },
      { x: 0, y: 70, width: 50, height: 30 },
      { x: 50, y: 70, width: 50, height: 30 },
    ],
  },
]
