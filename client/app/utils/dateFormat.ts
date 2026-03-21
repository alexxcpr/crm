import { DateFormatter, getLocalTimeZone } from '@internationalized/date'
import type { DateValue } from '@internationalized/date'

// Formatter pentru afișare dată (fără timp)
export const dateFormatter = new DateFormatter('ro-RO', { dateStyle: 'medium' })

// Formatter pentru afișare dată și timp
export const dateTimeFormatter = new DateFormatter('ro-RO', { 
  dateStyle: 'medium', 
  timeStyle: 'short' 
})

/**
 * Formatează o dată pentru afișare (fără timp)
 * @param value - string ISO, Date, sau DateValue
 * @param placeholder - text afișat când nu există valoare
 * @returns string formatat
 */
export function formatDate(
  value: string | Date | DateValue | null | undefined,
  placeholder: string = 'Selectează data'
): string {
  if (!value) return placeholder

  try {
    let date: Date

    if (value instanceof Date) {
      date = value
    } else if (typeof value === 'string') {
      date = new Date(value)
    } else {
      // DateValue din @internationalized/date
      date = value.toDate(getLocalTimeZone())
    }

    if (isNaN(date.getTime())) return placeholder

    return dateFormatter.format(date)
  } catch {
    return placeholder
  }
}

/**
 * Formatează o dată cu timp pentru afișare
 * @param value - string ISO, Date, sau DateValue
 * @param time - obiect opțional cu hour și minute (pentru când value e doar dată)
 * @param placeholder - text afișat când nu există valoare
 * @returns string formatat
 */
export function formatDateTime(
  value: string | Date | DateValue | null | undefined,
  time?: { hour: number; minute: number },
  placeholder: string = 'Selectează data și ora'
): string {
  if (!value) return placeholder

  try {
    let date: Date

    if (value instanceof Date) {
      date = value
    } else if (typeof value === 'string') {
      date = new Date(value)
    } else {
      date = value.toDate(getLocalTimeZone())
    }

    if (isNaN(date.getTime())) return placeholder

    // Dacă se primește timp separat, îl adăugăm la dată
    if (time) {
      const timeStr = `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`
      return `${dateFormatter.format(date)}, ${timeStr}`
    }

    return dateTimeFormatter.format(date)
  } catch {
    return placeholder
  }
}

/**
 * Formatează pentru metadate (date_created, date_updated)
 * Afișează '-' dacă valoarea e null. Include milisecunde pentru precizie.
 * @param value - string ISO sau Date
 * @returns string formatat sau '-'
 */
export function formatMetadataDate(
  value: string | Date | null | undefined
): string {
  if (!value) return '-'

  try {
    const date = typeof value === 'string' ? new Date(value) : value
    if (isNaN(date.getTime())) return '-'

    // Formatter pentru dată (zi, lună, an)
    const datePart = dateFormatter.format(date)

    // Construim partea de timp manual cu milisecunde
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    const milliseconds = String(date.getMilliseconds()).padStart(3, '0')

    return `${datePart}, ${hours}:${minutes}:${seconds}.${milliseconds}`
  } catch {
    return '-'
  }
}

/**
 * Convertește string ISO în obiect Date JavaScript
 * @param value - string ISO
 * @returns Date sau null dacă e invalid
 */
export function isoToDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return isNaN(date.getTime()) ? null : date
}
