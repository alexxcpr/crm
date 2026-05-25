export function useApi() {
  const config = useRuntimeConfig()
  const { token } = useAuth()
  const { slug } = useTenant()
  const baseURL = import.meta.server
    ? (config.apiBaseInternal as string)
    : (config.public.apiBase as string)

  const apiFetch = $fetch.create({
    baseURL,
    onRequest({ options }) {
      const headers = new Headers(options.headers)
      if (token.value) {
        headers.set('Authorization', token.value)
      }
      if (slug.value) {
        headers.set('X-Tenant', slug.value)
      }
      options.headers = headers
    }
  })

  return { apiFetch }
}
