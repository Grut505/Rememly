export const CONSTANTS = {
  MAX_TEXT_LENGTH: 300,
  MAX_PHOTOS_IN_ASSEMBLY: 10,
  IMAGE_MAX_SIZE_MB: 2,
  TIMEZONE: 'Europe/Paris',
  PDF_POLL_INTERVAL_MS: 3000,
  INFINITE_SCROLL_THRESHOLD: 0.8,
  TARGET_IMAGE_WIDTH_PX: 2480, // A4 width at 300dpi
} as const

export const MONTHS_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
] as const
