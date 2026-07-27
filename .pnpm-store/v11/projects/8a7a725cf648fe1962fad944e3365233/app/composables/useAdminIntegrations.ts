import type { SmtpIntegration, SmtpIntegrationPayload } from '~/types/admin'

interface ApiResponse<T> {
  data: T
  message?: string
}

export function useAdminIntegrations() {
  const { apiFetch } = useApi()
  const integrations = useState<SmtpIntegration[]>('admin-smtp-integrations', () => [])
  const loaded = useState<boolean>('admin-smtp-integrations-loaded', () => false)
  const loading = useState<boolean>('admin-smtp-integrations-loading', () => false)
  const error = useState<string | null>('admin-smtp-integrations-error', () => null)

  function requestError(err: any, fallback: string) {
    return err?.data?.message || err?.message || fallback
  }

  async function fetchIntegrations(force = false) {
    if (loaded.value && !force) return integrations.value
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch<ApiResponse<SmtpIntegration[]>>('/v1/admin/integrations', {
        query: { type: 'smtp' }
      })
      integrations.value = response.data
      loaded.value = true
      return integrations.value
    } catch (err: any) {
      error.value = requestError(err, 'Integrarile nu au putut fi incarcate.')
      return []
    } finally {
      loading.value = false
    }
  }

  async function createIntegration(payload: SmtpIntegrationPayload) {
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch<ApiResponse<SmtpIntegration>>('/v1/admin/integrations/smtp', {
        method: 'POST',
        body: payload
      })
      await fetchIntegrations(true)
      return response.data
    } catch (err: any) {
      error.value = requestError(err, 'Integrarea SMTP nu a putut fi creata.')
      return null
    } finally {
      loading.value = false
    }
  }

  async function updateIntegration(id: string, payload: Partial<SmtpIntegrationPayload>) {
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch<ApiResponse<SmtpIntegration>>(`/v1/admin/integrations/${id}`, {
        method: 'PUT',
        body: payload
      })
      await fetchIntegrations(true)
      return response.data
    } catch (err: any) {
      error.value = requestError(err, 'Integrarea SMTP nu a putut fi actualizata.')
      return null
    } finally {
      loading.value = false
    }
  }

  async function testIntegration(id: string, to: string) {
    loading.value = true
    error.value = null
    try {
      await apiFetch(`/v1/admin/integrations/${id}/test`, { method: 'POST', body: { to } })
      return true
    } catch (err: any) {
      error.value = requestError(err, 'Emailul de test nu a putut fi trimis.')
      return false
    } finally {
      loading.value = false
    }
  }

  async function deleteIntegration(id: string, replacementIntegrationId?: string) {
    loading.value = true
    error.value = null
    try {
      await apiFetch(`/v1/admin/integrations/${id}`, {
        method: 'DELETE',
        body: replacementIntegrationId ? { replacementIntegrationId } : {}
      })
      await fetchIntegrations(true)
      return true
    } catch (err: any) {
      error.value = requestError(err, 'Integrarea SMTP nu a putut fi stearsa.')
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    integrations,
    loading,
    error,
    fetchIntegrations,
    createIntegration,
    updateIntegration,
    testIntegration,
    deleteIntegration
  }
}
