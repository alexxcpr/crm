export function useTenant() {
  const config = useRuntimeConfig()
  const defaultSlug = (config.public.defaultTenantSlug as string) || 'dev'

  const slug = computed(() => {
    if (import.meta.server) return defaultSlug

    const hostname = window.location.hostname
    // Extract subdomain: "acme.mycrm.ro" → "acme"
    // In dev (localhost), fall back to env default
    const parts = hostname.split('.')
    if (parts.length >= 3) {
      return parts[0]
    }

    return defaultSlug
  })

  return { slug }
}
