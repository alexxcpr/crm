export interface WorkflowHttpDomain {
  id_domain: string
  name: string
  hostname: string
  port: number | null
  is_active: boolean
}

export function useWorkflowHttpDomains() {
  const { apiFetch } = useApi()
  const domains = useState<WorkflowHttpDomain[]>('workflow-http-domains', () => [])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchDomains() {
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch<{ data: WorkflowHttpDomain[] }>('/v1/admin/workflow-http-domains')
      domains.value = response.data
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Domeniile nu au putut fi incarcate.'
    } finally {
      loading.value = false
    }
  }

  async function createDomain(payload: { name: string, hostname: string, port?: number, isActive?: boolean }) {
    loading.value = true
    error.value = null
    try {
      await apiFetch('/v1/admin/workflow-http-domains', { method: 'POST', body: payload })
      await fetchDomains()
      return true
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Domeniul nu a putut fi aprobat.'
      return false
    } finally {
      loading.value = false
    }
  }

  async function updateDomain(id: string, payload: Record<string, any>) {
    loading.value = true
    error.value = null
    try {
      await apiFetch(`/v1/admin/workflow-http-domains/${id}`, { method: 'PUT', body: payload })
      await fetchDomains()
      return true
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Domeniul nu a putut fi actualizat.'
      return false
    } finally {
      loading.value = false
    }
  }

  async function deleteDomain(id: string) {
    loading.value = true
    error.value = null
    try {
      await apiFetch(`/v1/admin/workflow-http-domains/${id}`, { method: 'DELETE' })
      await fetchDomains()
      return true
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Domeniul nu a putut fi eliminat.'
      return false
    } finally {
      loading.value = false
    }
  }

  return { domains, loading, error, fetchDomains, createDomain, updateDomain, deleteDomain }
}
