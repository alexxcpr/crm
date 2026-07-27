import type { DashboardCatalog, DashboardDefinition } from '~/types/dashboard'

interface ApiResponse<T> {
  data: T
  mesaj?: string
}

function normalizeDashboardPayload(dashboard: DashboardDefinition): DashboardDefinition {
  return {
    ...dashboard,
    blocks: dashboard.blocks.map(block => ({
      ...block,
      widgets: block.widgets.map(widget => ({
        ...widget,
        filters: Array.isArray(widget.filters) ? widget.filters : []
      }))
    }))
  }
}

function requestError(err: any, fallback: string) {
  const message = err?.data?.message || err?.message
  return Array.isArray(message) ? message.join('\n') : message || fallback
}

export function useAdminDashboards() {
  const { apiFetch } = useApi()
  const dashboards = useState<DashboardDefinition[]>('admin-dashboards', () => [])
  const catalog = useState<DashboardCatalog | null>('admin-dashboard-catalog', () => null)
  const loading = useState('admin-dashboards-loading', () => false)
  const error = useState<string | null>('admin-dashboards-error', () => null)

  async function fetchDashboards() {
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch<ApiResponse<DashboardDefinition[]>>('/v1/admin/dashboards')
      dashboards.value = response.data
    } catch (err: any) {
      error.value = requestError(err, 'Dashboard-urile nu au putut fi incarcate.')
    } finally {
      loading.value = false
    }
  }

  async function fetchCatalog() {
    if (catalog.value) return catalog.value
    try {
      const response = await apiFetch<ApiResponse<DashboardCatalog>>('/v1/admin/dashboards/catalog')
      catalog.value = response.data
      return response.data
    } catch (err: any) {
      error.value = requestError(err, 'Catalogul dashboard-urilor nu a putut fi incarcat.')
      return null
    }
  }

  async function fetchDashboard(id: string) {
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch<ApiResponse<DashboardDefinition>>(`/v1/admin/dashboards/${id}`)
      return response.data
    } catch (err: any) {
      error.value = requestError(err, 'Dashboard-ul nu a putut fi incarcat.')
      return null
    } finally {
      loading.value = false
    }
  }

  async function saveDashboard(dashboard: DashboardDefinition) {
    loading.value = true
    error.value = null
    try {
      const url = dashboard.id_ui_dashboard
        ? `/v1/admin/dashboards/${dashboard.id_ui_dashboard}`
        : '/v1/admin/dashboards'
      const response = await apiFetch<ApiResponse<DashboardDefinition>>(url, {
        method: dashboard.id_ui_dashboard ? 'PUT' : 'POST',
        body: normalizeDashboardPayload(dashboard)
      })
      await fetchDashboards()
      return response.data
    } catch (err: any) {
      error.value = requestError(err, 'Dashboard-ul nu a putut fi salvat.')
      return null
    } finally {
      loading.value = false
    }
  }

  async function deleteDashboard(id: string) {
    loading.value = true
    error.value = null
    try {
      await apiFetch(`/v1/admin/dashboards/${id}`, { method: 'DELETE' })
      await fetchDashboards()
      return true
    } catch (err: any) {
      error.value = requestError(err, 'Dashboard-ul nu a putut fi dezactivat.')
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    dashboards,
    catalog,
    loading,
    error,
    fetchDashboards,
    fetchCatalog,
    fetchDashboard,
    saveDashboard,
    deleteDashboard
  }
}
