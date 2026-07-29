import type { PaginatedResponse, SingleResponse, FetchParams } from '~/types/schema'
import { buildEntityDataQuery } from '~/utils/entityDataQuery'

export function useEntityData(entitySlug: MaybeRef<string>) {
  const { apiFetch } = useApi()
  const { invalidateRelationEntity } = useRelationOptionsCache()

  const items = ref<Record<string, any>[]>([])
  const meta = ref<PaginatedResponse['meta']>({
    total: 0,
    page: 1,
    limit: 25,
    totalPages: 0
  })
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchItems(params: FetchParams = {}) {
    const slug = toValue(entitySlug)
    loading.value = true
    error.value = null

    try {
      const queryParams = buildEntityDataQuery(params)
      const response = await apiFetch<PaginatedResponse>(`/v1/data/${slug}`, {
        query: queryParams
      })
      items.value = response.data
      meta.value = response.meta
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la incarcarea datelor'
      console.error(`[useEntityData] Eroare fetchItems "${slug}":`, err)
    } finally {
      loading.value = false
    }
  }

  async function fetchOne(id: string): Promise<Record<string, any> | null> {
    const slug = toValue(entitySlug)

    try {
      const response = await apiFetch<SingleResponse>(`/v1/data/${slug}/${id}`)
      return response.data
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la incarcarea inregistrarii'
      console.error(`[useEntityData] Eroare fetchOne "${slug}/${id}":`, err)
      return null
    }
  }

  async function create(body: Record<string, any>): Promise<Record<string, any> | null> {
    const slug = toValue(entitySlug)
    loading.value = true
    error.value = null

    try {
      const response = await apiFetch<SingleResponse>(`/v1/data/${slug}`, {
        method: 'POST',
        body
      })
      invalidateRelationEntity(slug)
      return response.data
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la creare'
      console.error(`[useEntityData] Eroare create "${slug}":`, err)
      return null
    } finally {
      loading.value = false
    }
  }

  async function update(id: string, body: Record<string, any>): Promise<Record<string, any> | null> {
    const slug = toValue(entitySlug)
    loading.value = true
    error.value = null

    try {
      const response = await apiFetch<SingleResponse>(`/v1/data/${slug}/${id}`, {
        method: 'PUT',
        body
      })
      invalidateRelationEntity(slug)
      return response.data
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la actualizare'
      console.error(`[useEntityData] Eroare update "${slug}/${id}":`, err)
      return null
    } finally {
      loading.value = false
    }
  }

  async function remove(id: string): Promise<boolean> {
    const slug = toValue(entitySlug)
    loading.value = true
    error.value = null

    try {
      await apiFetch(`/v1/data/${slug}/${id}`, {
        method: 'DELETE'
      })
      invalidateRelationEntity(slug)
      items.value = items.value.filter(item => item.id !== id)
      meta.value.total--
      return true
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la stergere'
      console.error(`[useEntityData] Eroare remove "${slug}/${id}":`, err)
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    items,
    meta,
    loading,
    error,
    fetchItems,
    fetchOne,
    create,
    update,
    remove
  }
}
