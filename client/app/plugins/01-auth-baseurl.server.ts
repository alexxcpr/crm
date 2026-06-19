/**
 * Fixes @sidebase/nuxt-auth v1.2.0 SSR session restoration on Nuxt 4.
 *
 * The auth module cannot reliably restore the local provider session during
 * Nuxt 4 SSR, so we seed the token/session state manually. In production this
 * also has to carry X-Tenant, because there is no dev tenant fallback.
 */
import { getCookie, setCookie } from 'h3'

interface AuthTokens {
  accessToken: string
  refreshToken?: string
}

const ACCESS_TOKEN_MAX_AGE = 30 * 60
const REFRESH_TOKEN_MAX_AGE = 24 * 60 * 60

function isEnabled(value: unknown) {
  return value === true || value === 'true'
}

function authCookieOptions(maxAge: number, config: ReturnType<typeof useRuntimeConfig>) {
  return {
    path: '/',
    maxAge,
    sameSite: 'lax' as const,
    secure: isEnabled(config.authSecureCookie),
    httpOnly: isEnabled(config.authHttpOnlyCookie)
  }
}

export default defineNuxtPlugin(async () => {
  if (!import.meta.server) return

  const config = useRuntimeConfig()
  const event = useRequestEvent()
  if (!event) return
  const ssrEvent = event

  const { slug } = useTenant()
  const tenantSlug = slug.value
  const apiBase = config.apiBaseInternal as string

  let rawToken = getCookie(ssrEvent, 'auth.token') ?? null
  let rawRefreshToken = getCookie(ssrEvent, 'auth.refresh-token') ?? null

  function seedTokens(accessToken: string, refreshToken?: string | null) {
    const tokenState = useState<string | null>('auth:raw-token', () => accessToken)
    tokenState.value = accessToken
    console.log('[01-auth-baseurl] token seeded, length:', accessToken.length)

    if (refreshToken) {
      const refreshTokenState = useState<string | null>('auth:raw-refresh-token', () => refreshToken)
      refreshTokenState.value = refreshToken
      console.log('[01-auth-baseurl] refresh token seeded, length:', refreshToken.length)
    }
  }

  function tenantHeaders(token?: string) {
    const headers = new Headers()
    if (tenantSlug) {
      headers.set('X-Tenant', tenantSlug)
    }
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    return headers
  }

  async function rotateTokens() {
    if (!rawRefreshToken) {
      return null
    }

    const response = await $fetch<AuthTokens>(`${apiBase}/auth/refresh`, {
      method: 'POST',
      headers: tenantHeaders(),
      body: { refreshToken: rawRefreshToken }
    })

    if (!response?.accessToken) {
      return null
    }

    rawToken = response.accessToken
    rawRefreshToken = response.refreshToken ?? rawRefreshToken

    setCookie(ssrEvent, 'auth.token', response.accessToken, authCookieOptions(ACCESS_TOKEN_MAX_AGE, config))
    if (response.refreshToken) {
      setCookie(ssrEvent, 'auth.refresh-token', response.refreshToken, authCookieOptions(REFRESH_TOKEN_MAX_AGE, config))
    }

    seedTokens(rawToken, rawRefreshToken)
    console.log('[01-auth-baseurl] session tokens refreshed on SSR')
    return rawToken
  }

  if (!rawToken) {
    console.log('[01-auth-baseurl] no auth.token cookie found in request')
    try {
      rawToken = await rotateTokens()
    } catch (err: any) {
      console.error('[01-auth-baseurl] refresh without access token failed:', err.message)
    }

    if (!rawToken) return
  } else {
    seedTokens(rawToken, rawRefreshToken)
  }

  try {
    const userData = await $fetch(`${apiBase}/user/me`, {
      headers: tenantHeaders(rawToken)
    })

    if (userData) {
      const dataState = useState<any>('auth:data', () => userData)
      dataState.value = userData
      console.log('[01-auth-baseurl] session seeded for user:', (userData as any).login_username)
    }
  } catch (err: any) {
    console.error('[01-auth-baseurl] backend /user/me failed:', err.message)

    try {
      const refreshedToken = await rotateTokens()
      if (!refreshedToken) {
        throw err
      }

      const userData = await $fetch(`${apiBase}/user/me`, {
        headers: tenantHeaders(refreshedToken)
      })

      if (userData) {
        const dataState = useState<any>('auth:data', () => userData)
        dataState.value = userData
        console.log('[01-auth-baseurl] session seeded after refresh for user:', (userData as any).login_username)
      }
    } catch (refreshErr: any) {
      // Keep the auth plugin from clearing a valid raw token during SSR.
      console.error('[01-auth-baseurl] SSR refresh fallback failed:', refreshErr.message)
      const dataState = useState<any>('auth:data', () => ({}))
      dataState.value = dataState.value ?? {}
    }
  }
})
