import { CONSTANTS, MONTHS_FR } from './constants'

export function formatDate(isoString: string): string {
  const date = new Date(isoString)
  const day = date.getDate()
  const month = MONTHS_FR[date.getMonth()].toLowerCase()
  const year = date.getFullYear()
  return `${day} ${month} ${year}`
}

export function formatDateShort(isoString: string): string {
  const date = new Date(isoString)
  const day = date.getDate()
  const month = MONTHS_FR[date.getMonth()].substring(0, 3).toLowerCase()
  return `${day} ${month}`
}

export function getCurrentYear(): number {
  return new Date().getFullYear()
}

export function getPreviousYear(): number {
  return new Date().getFullYear() - 1
}

export function getYearStart(year: number): string {
  return `${year}-01-01T00:00:00.000Z`
}

export function getYearEnd(year: number): string {
  return `${year}-12-31T23:59:59.999Z`
}

export function toISOString(date: Date): string {
  return date.toISOString()
}

export function now(): string {
  return new Date().toISOString()
}
