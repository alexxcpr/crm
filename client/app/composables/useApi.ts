import { withSingleAuthRetry } from '~/utils/authRetry'

export function useApi() {
  const config = useRuntimeConfig()
  const { refresh, clearLocalSession } = useAuth()
  const { slug } = useTenant()
  const tenantSlug = slug.value
  const baseURL = import.meta.server
    ? (config.apiBaseInternal as string)
    : (config.public.apiBase as string)

  async function execute<T>(request: string, options: Record<string, any>): Promise<T> {
    const headers = new Headers(options.headers)
    if (tenantSlug) headers.set('X-Tenant', tenantSlug)
    if (import.meta.server) {
      const event = useRequestEvent()
      const contextualToken = event?.context.moduvisAccessToken as string | undefined
      const cookieToken = event ? (await import('h3')).getCookie(event, 'auth.token') : undefined
      const accessToken = contextualToken || cookieToken
      if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
    }
    return $fetch<T>(request, {
      ...options, baseURL, credentials: 'include', headers
    } as any)
  }

  async function apiFetch<T = unknown>(request: string, options: Record<string, any> = {}): Promise<T> {
    if (request.startsWith('/auth/')) return execute<T>(request, options)
    return withSingleAuthRetry({
      execute: () => execute<T>(request, options),
      refresh,
      onDefinitiveUnauthorized: async () => {
        clearLocalSession()
        if (import.meta.client) await navigateTo('/login', { replace: true })
      }
    })
  }

  return { apiFetch }
}
