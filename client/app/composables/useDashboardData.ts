import type { DashboardDefinition, DashboardQueryResult, DashboardWidgetResult } from '~/types/dashboard'

interface ApiResponse<T> {
  data: T
}

export function useDashboardData() {
  const { apiFetch } = useApi()
  const dashboard = ref<DashboardDefinition | null>(null)
  const queryResult = ref<DashboardQueryResult | null>(null)
  const loading = ref(false)
  const querying = ref(false)
  const error = ref<string | null>(null)

  const resultsByWidget = computed(() => new Map<string, DashboardWidgetResult>(
    (queryResult.value?.widgets ?? []).map(result => [result.widgetId, result])
  ))

  async function fetchDashboard(slug?: string) {
    loading.value = true
    error.value = null
    try {
      const endpoint = slug ? `/v1/dashboards/${slug}` : '/v1/dashboards/default'
      const response = await apiFetch<ApiResponse<DashboardDefinition>>(endpoint)
      dashboard.value = response.data
      return response.data
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Dashboard-ul nu a putut fi incarcat.'
      dashboard.value = null
      return null
    } finally {
      loading.value = false
    }
  }

  async function queryDashboard(from: Date, to: Date) {
    if (!dashboard.value) return null
    querying.value = true
    error.value = null
    try {
      const response = await apiFetch<ApiResponse<DashboardQueryResult>>(`/v1/dashboards/${dashboard.value.slug}/query`, {
        method: 'POST',
        body: {
          from: from.toISOString(),
          to: to.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
        }
      })
      queryResult.value = response.data
      return response.data
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Datele dashboard-ului nu au putut fi calculate.'
      return null
    } finally {
      querying.value = false
    }
  }

  return {
    dashboard,
    queryResult,
    resultsByWidget,
    loading,
    querying,
    error,
    fetchDashboard,
    queryDashboard
  }
}
