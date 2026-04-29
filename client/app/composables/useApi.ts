export function useApi() {
  const config = useRuntimeConfig()
  const { token } = useAuth()
  const { slug } = useTenant()

  const apiFetch = $fetch.create({
    baseURL: config.public.apiBase as string,
    onRequest({ options }) {
      if (token.value) {
        options.headers.set('Authorization', token.value)
      }
      if (slug.value) {
        options.headers.set('X-Tenant', slug.value)
      }
    }
  })

  return { apiFetch }
}
