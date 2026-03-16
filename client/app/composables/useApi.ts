export function useApi() {
    const config = useRuntimeConfig()
    const { token } = useAuth()
  
    const apiFetch = $fetch.create({
      baseURL: config.public.apiBase as string,
      onRequest({ options }) {
        if (token.value) {
          options.headers.set('Authorization',token.value)
        }
      }
    })
  
    return { apiFetch }
  }