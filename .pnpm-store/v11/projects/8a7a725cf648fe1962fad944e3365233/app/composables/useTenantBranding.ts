export interface TenantBranding {
  organizationName: string
  logoUrl: string | null
  primaryColor: string
  locale: string
  timezone: string
  dateFormat: string
  defaultCurrency: string
}

export const DEFAULT_TENANT_BRANDING: TenantBranding = {
  organizationName: 'Moduvis',
  logoUrl: null,
  primaryColor: 'violet',
  locale: 'ro-RO',
  timezone: 'Europe/Bucharest',
  dateFormat: 'dd.MM.yyyy',
  defaultCurrency: 'RON'
}

export function useTenantBranding() {
  const config = useRuntimeConfig()
  const appConfig = useAppConfig()
  const { slug } = useTenant()
  const branding = useState<TenantBranding>('tenant-branding', () => ({ ...DEFAULT_TENANT_BRANDING }))
  const loaded = useState('tenant-branding-loaded', () => false)
  const loading = useState('tenant-branding-loading', () => false)

  function apply(value: TenantBranding) {
    branding.value = value
    appConfig.ui.colors.primary = value.primaryColor as any
  }

  async function fetchBranding(force = false) {
    if (loaded.value && !force) {
      apply(branding.value)
      return branding.value
    }
    if (loading.value) return branding.value
    loading.value = true
    try {
      const base = import.meta.server
        ? config.apiBaseInternal as string
        : config.public.apiBase as string
      const response = await $fetch<{ data: TenantBranding }>(`${base}/v1/public/tenant-branding`, {
        headers: {
          'X-Tenant': slug.value
        }
      })
      apply(response.data)
      loaded.value = true
    } catch {
      apply({ ...DEFAULT_TENANT_BRANDING })
    } finally {
      loading.value = false
    }
    return branding.value
  }

  return { branding, loaded, loading, fetchBranding, apply }
}
