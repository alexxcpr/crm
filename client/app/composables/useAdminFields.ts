import type { Field } from '~/types/schema'
import type { FieldPayload, UpdateFieldPayload } from '~/types/admin'

interface ApiResponse<T> {
  mesaj: string
  data: T
  cod: number
}

export function useAdminFields(entityId: MaybeRef<string>) {
  const { apiFetch } = useApi()

  const fields = ref<Field[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  function basePath() {
    return `/v1/admin/entities/${toValue(entityId)}/fields`
  }

  async function fetchFields() {
    loading.value = true
    error.value = null

    try {
      const response = await apiFetch<ApiResponse<Field[]>>(basePath())
      fields.value = response.data
    }
    catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la incarcarea campurilor'
      console.error('[useAdminFields] fetchFields:', err)
    }
    finally {
      loading.value = false
    }
  }

  async function fetchField(fieldId: string): Promise<Field | null> {
    try {
      const response = await apiFetch<ApiResponse<Field>>(`${basePath()}/${fieldId}`)
      return response.data
    }
    catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la incarcarea campului'
      console.error('[useAdminFields] fetchField:', err)
      return null
    }
  }

  async function createField(payload: FieldPayload): Promise<Field | null> {
    loading.value = true
    error.value = null

    try {
      const response = await apiFetch<ApiResponse<Field>>(basePath(), {
        method: 'POST',
        body: payload
      })
      await fetchFields()
      return response.data
    }
    catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la crearea campului'
      console.error('[useAdminFields] createField:', err)
      return null
    }
    finally {
      loading.value = false
    }
  }

  async function updateField(fieldId: string, payload: UpdateFieldPayload): Promise<Field | null> {
    loading.value = true
    error.value = null

    try {
      const response = await apiFetch<ApiResponse<Field>>(`${basePath()}/${fieldId}`, {
        method: 'PUT',
        body: payload
      })
      await fetchFields()
      return response.data
    }
    catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la actualizarea campului'
      console.error('[useAdminFields] updateField:', err)
      return null
    }
    finally {
      loading.value = false
    }
  }

  async function deleteField(fieldId: string): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      await apiFetch(`${basePath()}/${fieldId}`, { method: 'DELETE' })
      await fetchFields()
      return true
    }
    catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la stergerea campului'
      console.error('[useAdminFields] deleteField:', err)
      return false
    }
    finally {
      loading.value = false
    }
  }

  return {
    fields,
    loading,
    error,
    fetchFields,
    fetchField,
    createField,
    updateField,
    deleteField
  }
}
