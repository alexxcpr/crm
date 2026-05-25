export function useTenant() {
  const config = useRuntimeConfig()
  const defaultSlug = (config.public.defaultTenantSlug as string) || 'dev'

  function slugFromHost(host?: string | null) {
    if (host === null || host === undefined) return defaultSlug

    const [hostname = ''] = host.split(':')
    if (!hostname) return defaultSlug

    const parts = hostname.split('.')
    if (parts.length >= 3) {
      return parts[0] ?? defaultSlug
    }

    return defaultSlug
  }

  const slug = computed(() => {
    if (import.meta.server) {
      const headers = useRequestHeaders(['host'])
      return slugFromHost(headers.host)
    }

    const hostname = window.location.hostname
    return slugFromHost(hostname)
  })

  return { slug }
}
