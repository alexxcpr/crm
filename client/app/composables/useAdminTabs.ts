import type { AdminTab, CreateTabPayload, UpdateTabPayload } from '~/types/admin'

interface ApiResponse<T> {
  mesaj: string
  data: T
  cod: number
}

export function useAdminTabs(entityId: MaybeRef<string>) {
  const { apiFetch } = useApi()

  const tabs = ref<AdminTab[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  function basePath() {
    return `/v1/admin/entities/${toValue(entityId)}/tabs`
  }

  async function fetchTabs() {
    loading.value = true
    error.value = null

    try {
      const response = await apiFetch<ApiResponse<AdminTab[]>>(basePath())
      tabs.value = response.data
    }
    catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la incarcarea tab-urilor'
      console.error('[useAdminTabs] fetchTabs:', err)
    }
    finally {
      loading.value = false
    }
  }

  async function fetchTab(tabId: string): Promise<AdminTab | null> {
    try {
      const response = await apiFetch<ApiResponse<AdminTab>>(`${basePath()}/${tabId}`)
      return response.data
    }
    catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la incarcarea tab-ului'
      console.error('[useAdminTabs] fetchTab:', err)
      return null
    }
  }

  async function createTab(payload: CreateTabPayload): Promise<AdminTab | null> {
    loading.value = true
    error.value = null

    try {
      const response = await apiFetch<ApiResponse<AdminTab>>(basePath(), {
        method: 'POST',
        body: payload
      })
      await fetchTabs()
      return response.data
    }
    catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la crearea tab-ului'
      console.error('[useAdminTabs] createTab:', err)
      return null
    }
    finally {
      loading.value = false
    }
  }

  async function updateTab(tabId: string, payload: UpdateTabPayload): Promise<AdminTab | null> {
    loading.value = true
    error.value = null

    try {
      const response = await apiFetch<ApiResponse<AdminTab>>(`${basePath()}/${tabId}`, {
        method: 'PUT',
        body: payload
      })
      await fetchTabs()
      return response.data
    }
    catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la actualizarea tab-ului'
      console.error('[useAdminTabs] updateTab:', err)
      return null
    }
    finally {
      loading.value = false
    }
  }

  async function deleteTab(tabId: string): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      await apiFetch(`${basePath()}/${tabId}`, { method: 'DELETE' })
      await fetchTabs()
      return true
    }
    catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la stergerea tab-ului'
      console.error('[useAdminTabs] deleteTab:', err)
      return false
    }
    finally {
      loading.value = false
    }
  }

  async function deleteTabs(ids: string[]): Promise<string | null> {
    loading.value = true
    error.value = null

    try {
      const res = await apiFetch(basePath(), {
        method: 'DELETE',
        body: { ids }
      })
      await fetchTabs()
      return (res as any).mesaj ?? null
    }
    catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la stergerea tab-urilor'
      console.error('[useAdminTabs] deleteTabs:', err)
      return null
    }
    finally {
      loading.value = false
    }
  }

  return {
    tabs,
    loading,
    error,
    fetchTabs,
    fetchTab,
    createTab,
    updateTab,
    deleteTab,
    deleteTabs
  }
}
