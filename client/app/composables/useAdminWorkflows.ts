interface WorkflowDefinition {
  id_workflow: string
  name: string
  slug: string
  nodes: any[]
  connections: any[]
  n8n_workflow_id: string | null
  status: 'draft' | 'active' | 'paused'
  version: number
  date_created: string
  date_updated: string
}

interface ApiResponse<T> {
  mesaj: string
  data: T
  cod: number
}

export interface CreateWorkflowPayload {
  name: string
  slug: string
  nodes?: any[]
  connections?: any[]
}

export interface UpdateWorkflowPayload {
  name?: string
  nodes?: any[]
  connections?: any[]
  status?: 'draft' | 'active' | 'paused'
}

export function useAdminWorkflows() {
  const { apiFetch } = useApi()

  const workflows = ref<WorkflowDefinition[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchWorkflows() {
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch<ApiResponse<WorkflowDefinition[]>>('/v1/admin/workflows')
      workflows.value = response.data
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la incarcarea workflow-urilor'
    } finally {
      loading.value = false
    }
  }

  async function fetchWorkflow(id: string): Promise<WorkflowDefinition | null> {
    try {
      const response = await apiFetch<ApiResponse<WorkflowDefinition>>(`/v1/admin/workflows/${id}`)
      return response.data
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la incarcarea workflow-ului'
      return null
    }
  }

  async function createWorkflow(payload: CreateWorkflowPayload): Promise<WorkflowDefinition | null> {
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch<ApiResponse<WorkflowDefinition>>('/v1/admin/workflows', {
        method: 'POST',
        body: payload
      })
      return response.data
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la crearea workflow-ului'
      return null
    } finally {
      loading.value = false
    }
  }

  async function updateWorkflow(id: string, payload: UpdateWorkflowPayload): Promise<WorkflowDefinition | null> {
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch<ApiResponse<WorkflowDefinition>>(`/v1/admin/workflows/${id}`, {
        method: 'PUT',
        body: payload
      })
      return response.data
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la actualizarea workflow-ului'
      return null
    } finally {
      loading.value = false
    }
  }

  async function deleteWorkflow(id: string): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      await apiFetch(`/v1/admin/workflows/${id}`, { method: 'DELETE' })
      await fetchWorkflows()
      return true
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la stergerea workflow-ului'
      return false
    } finally {
      loading.value = false
    }
  }

  async function deleteWorkflows(ids: string[]): Promise<string | null> {
    loading.value = true
    error.value = null
    try {
      const res = await apiFetch(`/v1/admin/workflows`, {
        method: 'DELETE',
        body: { ids }
      })
      await fetchWorkflows()
      return (res as any).message ?? null
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la stergerea workflow-urilor'
      return null
    } finally {
      loading.value = false
    }
  }

  async function activateWorkflow(id: string): Promise<WorkflowDefinition | null> {
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch<ApiResponse<WorkflowDefinition>>(`/v1/admin/workflows/${id}/activate`, {
        method: 'POST'
      })
      return response.data
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la activarea workflow-ului'
      return null
    } finally {
      loading.value = false
    }
  }

  async function deactivateWorkflow(id: string): Promise<WorkflowDefinition | null> {
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch<ApiResponse<WorkflowDefinition>>(`/v1/admin/workflows/${id}/deactivate`, {
        method: 'POST'
      })
      return response.data
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la dezactivarea workflow-ului'
      return null
    } finally {
      loading.value = false
    }
  }

  async function syncWorkflow(id: string): Promise<WorkflowDefinition | null> {
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch<ApiResponse<WorkflowDefinition>>(`/v1/admin/workflows/${id}/sync`, {
        method: 'POST'
      })
      return response.data
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la sincronizarea workflow-ului'
      return null
    } finally {
      loading.value = false
    }
  }

  return {
    workflows,
    loading,
    error,
    fetchWorkflows,
    fetchWorkflow,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    deleteWorkflows,
    activateWorkflow,
    deactivateWorkflow,
    syncWorkflow
  }
}
