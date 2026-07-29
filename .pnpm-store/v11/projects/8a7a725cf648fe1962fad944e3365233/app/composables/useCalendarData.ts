import type {
  CalendarDefinition,
  CalendarQueryResult,
  CalendarRuntimeFilterGroup
} from '~/types/calendar'

interface ApiResponse<T> {
  data: T
}

export function useCalendarData() {
  const { apiFetch } = useApi()
  const calendar = ref<CalendarDefinition | null>(null)
  const result = ref<CalendarQueryResult | null>(null)
  const loading = ref(false)
  const querying = ref(false)
  const error = ref<string | null>(null)

  function errorMessage(err: any, fallback: string) {
    const message = err?.data?.message || err?.message
    return Array.isArray(message) ? message.join('\n') : message || fallback
  }

  async function fetchCalendar(slug: string) {
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch<ApiResponse<CalendarDefinition>>(`/v1/calendars/${slug}`)
      calendar.value = response.data
      return response.data
    } catch (err: any) {
      error.value = errorMessage(err, 'Calendarul nu a putut fi încărcat.')
      calendar.value = null
      return null
    } finally {
      loading.value = false
    }
  }

  async function queryCalendar(
    from: Date,
    to: Date,
    sourceIds: string[],
    filters: CalendarRuntimeFilterGroup[]
  ) {
    if (!calendar.value) return null
    querying.value = true
    error.value = null
    try {
      const response = await apiFetch<ApiResponse<CalendarQueryResult>>(
        `/v1/calendars/${calendar.value.slug}/query`,
        {
          method: 'POST',
          body: {
            from: from.toISOString(),
            to: to.toISOString(),
            source_ids: sourceIds,
            filters
          }
        }
      )
      result.value = response.data
      return response.data
    } catch (err: any) {
      error.value = errorMessage(err, 'Evenimentele nu au putut fi încărcate.')
      result.value = null
      return null
    } finally {
      querying.value = false
    }
  }

  async function updateInterval(
    sourceId: string,
    recordId: string,
    interval: { start: string, end: string, all_day: boolean }
  ) {
    if (!calendar.value) throw new Error('Calendarul nu este încărcat.')
    return apiFetch(
      `/v1/calendars/${calendar.value.slug}/sources/${sourceId}/events/${recordId}/interval`,
      { method: 'PATCH', body: interval }
    )
  }

  return {
    calendar,
    result,
    loading,
    querying,
    error,
    fetchCalendar,
    queryCalendar,
    updateInterval
  }
}
