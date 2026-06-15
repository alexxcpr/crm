/**
 * Fixes @sidebase/nuxt-auth v1.2.0 SSR session restoration on Nuxt 4.
 *
 * Three problems are patched:
 * 1. The auth module relies on the `AUTH_ORIGIN` env var to resolve its
 *    baseURL during SSR, but Nitro may not expose arbitrary env vars.
 * 2. Nuxt 4's `useCookie` may not reliably read cookies during SSR.
 * 3. The auth module's `_fetch()` uses `callWithNuxt` which is broken in
 *    Nuxt 4 — so we bypass `getSession()` entirely by calling the backend
 *    directly and seeding both `auth:raw-token` and `auth:data` states.
 *
 * When `auth:data` is already populated, the auth plugin skips its
 * `getSession()` call, avoiding the `callWithNuxt` error entirely.
 *
 * Runs after 00-tenant-fetch (which patches global $fetch).
 */
import { getCookie } from 'h3'

export default defineNuxtPlugin(async () => {
  const config = useRuntimeConfig()

  if (import.meta.server) {
    // --- Patch 1: force baseURL to the internal backend URL ---
    if (config.apiBaseInternal) {
      config.public.auth.baseURL = config.apiBaseInternal as string
    }

    // --- Patch 2: manually restore the full session from the cookie ---
    const event = useRequestEvent()
    if (!event) return

    const rawToken = getCookie(event, 'auth.token')
    if (!rawToken) {
      console.log('[01-auth-baseurl] no auth.token cookie found in request')
      return
    }

    // Seed the raw token so useAuthState picks it up
    const tokenState = useState<string | null>('auth:raw-token', () => rawToken)
    tokenState.value = rawToken
    console.log('[01-auth-baseurl] token seeded, length:', rawToken.length)

    // Seed the refresh token from cookie so the auth module can refresh on SSR
    const rawRefreshToken = getCookie(event, 'auth.refresh-token')
    if (rawRefreshToken) {
      const refreshTokenState = useState<string | null>('auth:raw-refresh-token', () => rawRefreshToken)
      refreshTokenState.value = rawRefreshToken
      console.log('[01-auth-baseurl] refresh token seeded, length:', rawRefreshToken.length)
    }

    // Fetch session directly, bypassing @sidebase/nuxt-auth's _fetch()
    // which uses callWithNuxt — broken in Nuxt 4.
    const apiBase = config.apiBaseInternal as string
    try {
      const userData = await $fetch(`${apiBase}/user/me`, {
        headers: { authorization: `Bearer ${rawToken}` }
      })
      if (userData) {
        const dataState = useState<any>('auth:data', () => userData)
        dataState.value = userData
        console.log('[01-auth-baseurl] session seeded for user:', (userData as any).login_username)
      }
    } catch (err: any) {
      // If the backend call fails, still seed data with a stub to prevent
      // the auth plugin from calling getSession() (which would wipe rawToken).
      console.error('[01-auth-baseurl] backend /user/me failed:', err.message)
      const dataState = useState<any>('auth:data', () => ({}))
      dataState.value = dataState.value ?? {}
    }
  }
})
