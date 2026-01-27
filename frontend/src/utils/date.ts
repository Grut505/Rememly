import { CONSTANTS } from './constants'

export function formatDate(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

export function formatDateShort(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
  })
}

export function formatDateTimeFull(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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

export function getMonthYear(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  })
}

export function getMonthYearKey(isoString: string): string {
  const date = new Date(isoString)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}
