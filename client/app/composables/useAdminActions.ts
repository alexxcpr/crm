interface ActionDefinition {
  id_action: string
  id_entity: string
  name: string
  slug: string
  show_in_ui: boolean
  trigger_events: string[]
  trigger_conditions: Record<string, any> | null
  id_workflow: string | null
  workflow_name: string | null
  config: Record<string, any>
  is_active: boolean
  rank: number
  date_created: string
  date_updated: string
}

interface ApiResponse<T> {
  mesaj: string
  data: T
  cod: number
}

export interface CreateActionPayload {
  id_entity: string
  name: string
  slug: string
  show_in_ui?: boolean
  trigger_events?: string[]
  trigger_conditions?: Record<string, any>
  id_workflow?: string
  config?: Record<string, any>
  is_active?: boolean
  rank?: number
}

export interface UpdateActionPayload {
  name?: string
  show_in_ui?: boolean
  trigger_events?: string[]
  trigger_conditions?: Record<string, any>
  id_workflow?: string
  config?: Record<string, any>
  is_active?: boolean
  rank?: number
}

export function useAdminActions() {
  const { apiFetch } = useApi()

  const actions = ref<ActionDefinition[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchActions(entityId?: string) {
    loading.value = true
    error.value = null
    try {
      const query: Record<string, string> = {}
      if (entityId) query.entityId = entityId

      const response = await apiFetch<ApiResponse<ActionDefinition[]>>('/v1/admin/actions', { query })
      actions.value = response.data
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la incarcarea actiunilor'
    } finally {
      loading.value = false
    }
  }

  async function fetchAction(id: string): Promise<ActionDefinition | null> {
    try {
      const response = await apiFetch<ApiResponse<ActionDefinition>>(`/v1/admin/actions/${id}`)
      return response.data
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la incarcarea actiunii'
      return null
    }
  }

  async function createAction(payload: CreateActionPayload): Promise<ActionDefinition | null> {
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch<ApiResponse<ActionDefinition>>('/v1/admin/actions', {
        method: 'POST',
        body: payload
      })
      await fetchActions()
      return response.data
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la crearea actiunii'
      return null
    } finally {
      loading.value = false
    }
  }

  async function updateAction(id: string, payload: UpdateActionPayload): Promise<ActionDefinition | null> {
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch<ApiResponse<ActionDefinition>>(`/v1/admin/actions/${id}`, {
        method: 'PUT',
        body: payload
      })
      await fetchActions()
      return response.data
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la actualizarea actiunii'
      return null
    } finally {
      loading.value = false
    }
  }

  async function deleteAction(id: string): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      await apiFetch(`/v1/admin/actions/${id}`, { method: 'DELETE' })
      await fetchActions()
      return true
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la stergerea actiunii'
      return false
    } finally {
      loading.value = false
    }
  }

  async function deleteActions(ids: string[]): Promise<string | null> {
    loading.value = true
    error.value = null
    try {
      const res = await apiFetch(`/v1/admin/actions`, {
        method: 'DELETE',
        body: { ids }
      })
      await fetchActions()
      return (res as any).mesaj ?? null
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la stergerea actiunilor'
      return null
    } finally {
      loading.value = false
    }
  }

  return {
    actions,
    loading,
    error,
    fetchActions,
    fetchAction,
    createAction,
    updateAction,
    deleteAction,
    deleteActions
  }
}
