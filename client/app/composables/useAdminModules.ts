import type { AdminModule, ModulePayload } from '~/types/admin'

interface ApiResponse<T> {
  mesaj: string
  data: T
  cod: number
}

export function useAdminModules() {
  const { apiFetch } = useApi()

  const modules = ref<AdminModule[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchModules() {
    loading.value = true
    error.value = null

    try {
      const response = await apiFetch<ApiResponse<AdminModule[]>>('/v1/admin/modules')
      modules.value = response.data
    }
    catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la incarcarea modulelor'
      console.error('[useAdminModules] fetchModules:', err)
    }
    finally {
      loading.value = false
    }
  }

  async function fetchModule(id: string): Promise<AdminModule | null> {
    try {
      const response = await apiFetch<ApiResponse<AdminModule>>(`/v1/admin/modules/${id}`)
      return response.data
    }
    catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la incarcarea modulului'
      console.error('[useAdminModules] fetchModule:', err)
      return null
    }
  }

  async function createModule(payload: ModulePayload): Promise<AdminModule | null> {
    loading.value = true
    error.value = null

    try {
      const response = await apiFetch<ApiResponse<AdminModule>>('/v1/admin/modules', {
        method: 'POST',
        body: payload
      })
      await fetchModules()
      return response.data
    }
    catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la crearea modulului'
      console.error('[useAdminModules] createModule:', err)
      return null
    }
    finally {
      loading.value = false
    }
  }

  async function updateModule(id: string, payload: Partial<ModulePayload>): Promise<AdminModule | null> {
    loading.value = true
    error.value = null

    try {
      const response = await apiFetch<ApiResponse<AdminModule>>(`/v1/admin/modules/${id}`, {
        method: 'PUT',
        body: payload
      })
      await fetchModules()
      return response.data
    }
    catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la actualizarea modulului'
      console.error('[useAdminModules] updateModule:', err)
      return null
    }
    finally {
      loading.value = false
    }
  }

  async function deleteModule(id: string): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      await apiFetch(`/v1/admin/modules/${id}`, { method: 'DELETE' })
      await fetchModules()
      return true
    }
    catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la stergerea modulului'
      console.error('[useAdminModules] deleteModule:', err)
      return false
    }
    finally {
      loading.value = false
    }
  }

  return {
    modules,
    loading,
    error,
    fetchModules,
    fetchModule,
    createModule,
    updateModule,
    deleteModule
  }
}
