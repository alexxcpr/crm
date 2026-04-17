import type { AdminEntity, CreateEntityPayload, UpdateEntityPayload } from '~/types/admin'

interface ApiResponse<T> {
  mesaj: string
  data: T
  cod: number
}

export function useAdminEntities() {
  const { apiFetch } = useApi()

  const entities = ref<AdminEntity[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchEntities(moduleId?: string) {
    loading.value = true
    error.value = null

    try {
      const query: Record<string, string> = {}
      if (moduleId) query.moduleId = moduleId

      const response = await apiFetch<ApiResponse<AdminEntity[]>>('/v1/admin/entities', { query })
      entities.value = response.data
    }
    catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la incarcarea entitatilor'
      console.error('[useAdminEntities] fetchEntities:', err)
    }
    finally {
      loading.value = false
    }
  }

  async function fetchEntity(id: string): Promise<AdminEntity | null> {
    try {
      const response = await apiFetch<ApiResponse<AdminEntity>>(`/v1/admin/entities/${id}`)
      return response.data
    }
    catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la incarcarea entitatii'
      console.error('[useAdminEntities] fetchEntity:', err)
      return null
    }
  }

  async function createEntity(payload: CreateEntityPayload): Promise<AdminEntity | null> {
    loading.value = true
    error.value = null

    try {
      const response = await apiFetch<ApiResponse<AdminEntity>>('/v1/admin/entities', {
        method: 'POST',
        body: payload
      })
      await fetchEntities()
      return response.data
    }
    catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la crearea entitatii'
      console.error('[useAdminEntities] createEntity:', err)
      return null
    }
    finally {
      loading.value = false
    }
  }

  async function updateEntity(id: string, payload: UpdateEntityPayload): Promise<AdminEntity | null> {
    loading.value = true
    error.value = null

    try {
      const response = await apiFetch<ApiResponse<AdminEntity>>(`/v1/admin/entities/${id}`, {
        method: 'PUT',
        body: payload
      })
      await fetchEntities()
      return response.data
    }
    catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la actualizarea entitatii'
      console.error('[useAdminEntities] updateEntity:', err)
      return null
    }
    finally {
      loading.value = false
    }
  }

  async function deleteEntity(id: string): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      await apiFetch(`/v1/admin/entities/${id}`, { method: 'DELETE' })
      await fetchEntities()
      return true
    }
    catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la stergerea entitatii'
      console.error('[useAdminEntities] deleteEntity:', err)
      return false
    }
    finally {
      loading.value = false
    }
  }

  return {
    entities,
    loading,
    error,
    fetchEntities,
    fetchEntity,
    createEntity,
    updateEntity,
    deleteEntity
  }
}
