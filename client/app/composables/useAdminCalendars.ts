import type {
  CalendarCatalog,
  CalendarDefinition,
  CalendarQueryResult
} from '~/types/calendar'

interface ApiResponse<T> {
  data: T
}

function requestError(err: any, fallback: string) {
  const message = err?.data?.message || err?.message
  return Array.isArray(message) ? message.join('\n') : message || fallback
}

export function useAdminCalendars() {
  const { apiFetch } = useApi()
  const calendars = useState<CalendarDefinition[]>('admin-calendars', () => [])
  const catalog = useState<CalendarCatalog | null>('admin-calendar-catalog', () => null)
  const loading = useState('admin-calendars-loading', () => false)
  const error = useState<string | null>('admin-calendars-error', () => null)

  async function fetchCalendars() {
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch<ApiResponse<CalendarDefinition[]>>('/v1/admin/calendars')
      calendars.value = response.data
      return response.data
    } catch (err: any) {
      error.value = requestError(err, 'Calendarele nu au putut fi încărcate.')
      return []
    } finally {
      loading.value = false
    }
  }

  async function fetchCatalog() {
    if (catalog.value) return catalog.value
    try {
      const response = await apiFetch<ApiResponse<CalendarCatalog>>('/v1/admin/calendars/catalog')
      catalog.value = response.data
      return response.data
    } catch (err: any) {
      error.value = requestError(err, 'Catalogul calendarelor nu a putut fi încărcat.')
      return null
    }
  }

  async function fetchCalendar(id: string) {
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch<ApiResponse<CalendarDefinition>>(`/v1/admin/calendars/${id}`)
      return response.data
    } catch (err: any) {
      error.value = requestError(err, 'Calendarul nu a putut fi încărcat.')
      return null
    } finally {
      loading.value = false
    }
  }

  async function saveCalendar(calendar: CalendarDefinition) {
    loading.value = true
    error.value = null
    try {
      const endpoint = calendar.id_ui_calendar
        ? `/v1/admin/calendars/${calendar.id_ui_calendar}`
        : '/v1/admin/calendars'
      const response = await apiFetch<ApiResponse<CalendarDefinition>>(endpoint, {
        method: calendar.id_ui_calendar ? 'PUT' : 'POST',
        body: calendar
      })
      await fetchCalendars()
      return response.data
    } catch (err: any) {
      error.value = requestError(err, 'Calendarul nu a putut fi salvat.')
      return null
    } finally {
      loading.value = false
    }
  }

  async function deleteCalendar(id: string) {
    loading.value = true
    error.value = null
    try {
      await apiFetch(`/v1/admin/calendars/${id}`, { method: 'DELETE' })
      await fetchCalendars()
      return true
    } catch (err: any) {
      error.value = requestError(err, 'Calendarul nu a putut fi dezactivat.')
      return false
    } finally {
      loading.value = false
    }
  }

  async function previewCalendar(
    calendar: CalendarDefinition,
    from: Date,
    to: Date,
    signal?: AbortSignal
  ) {
    const response = await apiFetch<ApiResponse<CalendarQueryResult>>('/v1/admin/calendars/preview/query', {
      method: 'POST',
      signal,
      body: {
        calendar,
        query: {
          from: from.toISOString(),
          to: to.toISOString()
        }
      }
    })
    return response.data
  }

  return {
    calendars,
    catalog,
    loading,
    error,
    fetchCalendars,
    fetchCatalog,
    fetchCalendar,
    saveCalendar,
    deleteCalendar,
    previewCalendar
  }
}
