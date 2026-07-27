import type { AdminMenu, AdminMenuItem, MenuItemPayload, MenuPayload } from '~/types/admin'

interface ApiResponse<T> {
  mesaj: string
  data: T
  cod: number
}

export function useAdminMenus() {
  const { apiFetch } = useApi()
  const { fetchNavigation } = useNavigation()

  const menus = useState<AdminMenu[]>('admin-menus', () => [])
  const loading = useState('admin-menus-loading', () => false)
  const error = useState<string | null>('admin-menus-error', () => null)

  async function refreshSidebar() {
    await fetchNavigation()
  }

  async function fetchMenus() {
    loading.value = true
    error.value = null

    try {
      const response = await apiFetch<ApiResponse<AdminMenu[]>>('/v1/admin/menus')
      menus.value = response.data
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la incarcarea meniurilor'
      console.error('[useAdminMenus] fetchMenus:', err)
    } finally {
      loading.value = false
    }
  }

  async function fetchMenu(id: string): Promise<AdminMenu | null> {
    try {
      const response = await apiFetch<ApiResponse<AdminMenu>>(`/v1/admin/menus/${id}`)
      return response.data
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la incarcarea meniului'
      console.error('[useAdminMenus] fetchMenu:', err)
      return null
    }
  }

  async function createMenu(payload: MenuPayload): Promise<AdminMenu | null> {
    loading.value = true
    error.value = null

    try {
      const response = await apiFetch<ApiResponse<AdminMenu>>('/v1/admin/menus', {
        method: 'POST',
        body: payload
      })
      await fetchMenus()
      await refreshSidebar()
      return response.data
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la crearea meniului'
      console.error('[useAdminMenus] createMenu:', err)
      return null
    } finally {
      loading.value = false
    }
  }

  async function updateMenu(id: string, payload: MenuPayload): Promise<AdminMenu | null> {
    loading.value = true
    error.value = null

    try {
      const response = await apiFetch<ApiResponse<AdminMenu>>(`/v1/admin/menus/${id}`, {
        method: 'PUT',
        body: payload
      })
      await fetchMenus()
      await refreshSidebar()
      return response.data
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la actualizarea meniului'
      console.error('[useAdminMenus] updateMenu:', err)
      return null
    } finally {
      loading.value = false
    }
  }

  async function deleteMenu(id: string): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      await apiFetch(`/v1/admin/menus/${id}`, { method: 'DELETE' })
      await fetchMenus()
      await refreshSidebar()
      return true
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la stergerea meniului'
      console.error('[useAdminMenus] deleteMenu:', err)
      return false
    } finally {
      loading.value = false
    }
  }

  async function createMenuItem(menuId: string, payload: MenuItemPayload): Promise<AdminMenuItem | null> {
    loading.value = true
    error.value = null

    try {
      const response = await apiFetch<ApiResponse<AdminMenuItem>>(`/v1/admin/menus/${menuId}/items`, {
        method: 'POST',
        body: payload
      })
      await fetchMenus()
      await refreshSidebar()
      return response.data
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la crearea elementului de meniu'
      console.error('[useAdminMenus] createMenuItem:', err)
      return null
    } finally {
      loading.value = false
    }
  }

  async function updateMenuItem(id: string, payload: MenuItemPayload): Promise<AdminMenuItem | null> {
    loading.value = true
    error.value = null

    try {
      const response = await apiFetch<ApiResponse<AdminMenuItem>>(`/v1/admin/menu-items/${id}`, {
        method: 'PUT',
        body: payload
      })
      await fetchMenus()
      await refreshSidebar()
      return response.data
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la actualizarea elementului de meniu'
      console.error('[useAdminMenus] updateMenuItem:', err)
      return null
    } finally {
      loading.value = false
    }
  }

  async function deleteMenuItem(id: string): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      await apiFetch(`/v1/admin/menu-items/${id}`, { method: 'DELETE' })
      await fetchMenus()
      await refreshSidebar()
      return true
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la stergerea elementului de meniu'
      console.error('[useAdminMenus] deleteMenuItem:', err)
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    menus,
    loading,
    error,
    fetchMenus,
    fetchMenu,
    createMenu,
    updateMenu,
    deleteMenu,
    createMenuItem,
    updateMenuItem,
    deleteMenuItem
  }
}
