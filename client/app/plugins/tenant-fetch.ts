/**
 * Global fetch interceptor — adds X-Tenant header to ALL requests going to API base.
 * Covers @sidebase/nuxt-auth internal calls (signIn, getSession) that bypass useApi().
 */
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const { slug } = useTenant()
  const publicApiBase = config.public.apiBase as string
  const apiBase = import.meta.server ? (config.apiBaseInternal as string) : publicApiBase

  globalThis.$fetch = $fetch.create({
    onRequest({ options, request }) {
      const url = typeof request === 'string' ? request : request?.url ?? ''
      const isApiCall = url.startsWith(apiBase) || url.startsWith(publicApiBase) || url.startsWith('/')

      if (isApiCall && slug.value) {
        const headers = options.headers ??= new Headers()
        if (headers instanceof Headers) {
          if (!headers.has('X-Tenant')) {
            headers.set('X-Tenant', slug.value)
          }
        }
      }
    }
  })
})
