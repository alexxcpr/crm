interface BillingState {
  tenant: {
    slug: string
    plan: string
    billingStatus: string
    subscriptionStatus: string | null
    currentPeriodEnd: string | null
    isActive: boolean
  }
  profileSeats: {
    included: number
    contracted: number
    extra: number
    active: number
  }
  storage: {
    includedGb: number
    unitGb: number
    unitPriceEur: number
    extraUnits: number
    quotaGb: number
  }
  features: {
    reportsDashboards: boolean
  }
  scheduledChanges: {
    id: string
    change_type: string
    payload: Record<string, unknown> | string
    effective_at: string
  }[]
  stripe: {
    hasCustomer: boolean
    hasSubscription: boolean
  }
}

export function useAdminBilling() {
  const { apiFetch } = useApi()
  const billing = ref<BillingState | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)

  async function fetchBilling() {
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch<{ data: BillingState }>('/v1/admin/billing')
      billing.value = response.data
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Nu am putut incarca abonamentul.'
    } finally {
      loading.value = false
    }
  }

  async function updateBilling(payload: {
    profileSeats?: number
    extraStorageUnits?: number
    reportsDashboards?: boolean
  }) {
    saving.value = true
    error.value = null
    try {
      const response = await apiFetch<{ data: BillingState }>('/v1/admin/billing/update', {
        method: 'POST',
        body: payload
      })
      billing.value = response.data
      return true
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Nu am putut actualiza abonamentul.'
      return false
    } finally {
      saving.value = false
    }
  }

  async function openCustomerPortal() {
    const response = await apiFetch<{ data: { url: string | null } }>('/v1/admin/billing/customer-portal', {
      method: 'POST'
    })
    if (response.data.url) window.open(response.data.url, '_blank', 'noopener')
    return response.data
  }

  return {
    billing,
    loading,
    saving,
    error,
    fetchBilling,
    updateBilling,
    openCustomerPortal
  }
}
