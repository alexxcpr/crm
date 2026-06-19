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

  if (import.meta.server) {
    const headers = useRequestHeaders(['x-forwarded-host', 'host'])
    const slug = computed(() => {
      const forwardedHost = headers['x-forwarded-host']?.split(',')[0]?.trim()
      return slugFromHost(forwardedHost || headers.host)
    })
    return { slug }
  }

  const slug = computed(() => slugFromHost(window.location.hostname))
  return { slug }
}
