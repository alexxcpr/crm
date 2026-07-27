import { getLocalTimeZone } from '@internationalized/date'
import type { DateValue } from '@internationalized/date'
import { useState } from '#app'
import { DEFAULT_TENANT_BRANDING, type TenantBranding } from '~/composables/useTenantBranding'

// Formatter pentru afișare dată (fără timp)
function tenantFormatting() {
  try {
    return useState<TenantBranding>('tenant-branding').value || DEFAULT_TENANT_BRANDING
  } catch {
    return DEFAULT_TENANT_BRANDING
  }
}

function dateFormatter() {
  const settings = tenantFormatting()
  return { format(date: Date) {
    const parts = new Intl.DateTimeFormat(settings.locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: settings.timezone
    }).formatToParts(date)
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
    return settings.dateFormat
      .replace('dd', values.day || '')
      .replace('MM', values.month || '')
      .replace('yyyy', values.year || '')
  } }
}

function timeFormatter(includeSeconds = false) {
  const settings = tenantFormatting()
  return new Intl.DateTimeFormat(settings.locale, {
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: false,
    timeZone: settings.timezone
  })
}

// Formatter pentru afișare dată și timp
function dateTimeFormatter() {
  return { format(date: Date) {
    return `${dateFormatter().format(date)}, ${timeFormatter().format(date)}`
  } }
}

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

    return dateFormatter().format(date)
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
  time?: { hour: number, minute: number },
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
      return `${dateFormatter().format(date)}, ${timeStr}`
    }

    return dateTimeFormatter().format(date)
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
    const datePart = dateFormatter().format(date)
    return `${datePart}, ${timeFormatter(true).format(date)}`
  } catch {
    return '-'
  }
}

/** Offset local formatat ca +HH:MM sau -HH:MM */
function formatLocalTimezoneOffset(date: Date): string {
  const offset = -date.getTimezoneOffset()
  const offsetHours = Math.abs(Math.floor(offset / 60))
  const offsetMinutes = Math.abs(offset % 60)
  const offsetSign = offset >= 0 ? '+' : '-'
  return `${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMinutes).padStart(2, '0')}`
}

/**
 * ISO datetime la miezul nopții locale (nu UTC Z).
 * Evită afișarea 02:00/03:00 când utilizatorul introduce doar data.
 */
export function dateOnlyToLocalMidnightISO(dateStr: string): string {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return dateStr

  const year = parseInt(match[1]!, 10)
  const month = parseInt(match[2]!, 10)
  const day = parseInt(match[3]!, 10)
  return localDateTimeToISO(year, month, day, 0, 0, 0)
}

/**
 * Construiește ISO string cu offset de timezone local din componente calendar.
 */
export function localDateTimeToISO(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): string {
  const date = new Date(year, month - 1, day, hour, minute, second, 0)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}${formatLocalTimezoneOffset(date)}`
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
