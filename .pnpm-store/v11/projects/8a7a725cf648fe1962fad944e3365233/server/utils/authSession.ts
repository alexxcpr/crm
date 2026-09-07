import { createHash } from 'node:crypto'
import { createError, deleteCookie, getCookie, getHeader, setCookie, type H3Event } from 'h3'
import { SingleFlightCache } from './singleFlight'

interface AuthTokens { accessToken: string, refreshToken: string }
interface JwtClaims { exp?: number, sessionExp?: number }
interface SessionEnvelope<T = Record<string, unknown>> {
  data: T
  accessExpiresAt: string
  sessionExpiresAt: string
}

const REFRESH_REUSE_MS = 10_000
const REFRESH_THRESHOLD_SECONDS = 60
const refreshCoordinator = new SingleFlightCache<AuthTokens>(REFRESH_REUSE_MS)

function jwtClaims(token: string): JwtClaims {
  try {
    const [, payload] = token.split('.')
    if (!payload) return {}
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as JwtClaims
  } catch {
    return {}
  }
}

export function authErrorStatus(error: unknown): number {
  const candidate = error as {
    statusCode?: number
    status?: number
    response?: { status?: number }
    data?: { statusCode?: number }
  }
  return candidate?.statusCode
    ?? candidate?.status
    ?? candidate?.response?.status
    ?? candidate?.data?.statusCode
    ?? 500
}

function tenantSlug(event: H3Event): string {
  const explicit = getHeader(event, 'x-tenant')?.trim().toLowerCase()
  if (explicit) return explicit
  const config = useRuntimeConfig(event)
  const domainBase = String(config.public.appDomainBase || 'stanciulescu.xyz').toLowerCase()
  const forwarded = getHeader(event, 'x-forwarded-host')?.split(',')[0]?.trim()
  const host = ((forwarded || getHeader(event, 'host') || '').split(':')[0] || '').toLowerCase()
  if (host.endsWith(`.${domainBase}`)) return host.slice(0, -1 * (`.${domainBase}`).length)
  return String(config.public.defaultTenantSlug || 'dev')
}

function backendHeaders(event: H3Event, accessToken?: string): Headers {
  const headers = new Headers({ 'X-Tenant': tenantSlug(event) })
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  return headers
}

async function backendFetch<T>(
  event: H3Event,
  path: string,
  options: { method?: string, body?: unknown, accessToken?: string } = {}
): Promise<T> {
  const apiBase = String(useRuntimeConfig(event).apiBaseInternal).replace(/\/+$/, '')
  try {
    return await $fetch(`${apiBase}${path}`, {
      method: options.method as any,
      body: options.body as any,
      headers: backendHeaders(event, options.accessToken)
    }) as T
  } catch (error: any) {
    throw createError({
      statusCode: authErrorStatus(error),
      statusMessage: error?.response?.statusText || error?.statusMessage,
      message: error?.data?.message || error?.message || 'Serviciul de autentificare nu este disponibil.',
      data: error?.data
    })
  }
}

function cookieOptions(event: H3Event, expiresAt: number) {
  const config = useRuntimeConfig(event)
  const now = Math.floor(Date.now() / 1000)
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production' || config.authSecureCookie === true,
    maxAge: Math.max(1, expiresAt - now),
    expires: new Date(expiresAt * 1000)
  }
}

export function clearAuthCookies(event: H3Event): void {
  deleteCookie(event, 'auth.token', { path: '/' })
  deleteCookie(event, 'auth.refresh-token', { path: '/' })
}

function setAuthCookies(event: H3Event, tokens: AuthTokens): void {
  const access = jwtClaims(tokens.accessToken)
  const refresh = jwtClaims(tokens.refreshToken)
  if (!access.exp || !refresh.exp) throw createError({ statusCode: 502, message: 'Backendul a returnat tokenuri invalide.' })
  setCookie(event, 'auth.token', tokens.accessToken, cookieOptions(event, access.exp))
  setCookie(event, 'auth.refresh-token', tokens.refreshToken, cookieOptions(event, refresh.exp))
}

function envelope<T>(tokens: AuthTokens, data: T): SessionEnvelope<T> {
  const access = jwtClaims(tokens.accessToken)
  const refresh = jwtClaims(tokens.refreshToken)
  const accessExp = access.exp
  const sessionExp = refresh.sessionExp ?? refresh.exp
  if (!accessExp || !sessionExp) throw createError({ statusCode: 502, message: 'Backendul a returnat tokenuri fără expirare.' })
  return {
    data,
    accessExpiresAt: new Date(accessExp * 1000).toISOString(),
    sessionExpiresAt: new Date(sessionExp * 1000).toISOString()
  }
}

async function fetchUserSession<T>(event: H3Event, accessToken: string): Promise<T> {
  return backendFetch<T>(event, '/user/me', { accessToken })
}

async function rotateTokens(event: H3Event, refreshToken: string): Promise<AuthTokens> {
  const key = createHash('sha256').update(refreshToken).digest('hex')
  return refreshCoordinator.run(key, () => backendFetch<AuthTokens>(event, '/auth/refresh', {
    method: 'POST', body: { refreshToken }
  }))
}

async function refreshedSession<T>(event: H3Event, refreshToken: string): Promise<SessionEnvelope<T>> {
  try {
    const tokens = await rotateTokens(event, refreshToken)
    setAuthCookies(event, tokens)
    return envelope(tokens, await fetchUserSession<T>(event, tokens.accessToken))
  } catch (error) {
    if (authErrorStatus(error) === 401) clearAuthCookies(event)
    throw error
  }
}

export async function restoreSession<T>(event: H3Event): Promise<SessionEnvelope<T>> {
  const accessToken = getCookie(event, 'auth.token')
  const refreshToken = getCookie(event, 'auth.refresh-token')
  if (!accessToken && !refreshToken) throw createError({ statusCode: 401, message: 'Sesiune inexistentă.' })

  const now = Math.floor(Date.now() / 1000)
  const access = accessToken ? jwtClaims(accessToken) : {}
  const shouldRefresh = !accessToken || !access.exp || access.exp - now <= REFRESH_THRESHOLD_SECONDS
  if (shouldRefresh && refreshToken) {
    try {
      return await refreshedSession<T>(event, refreshToken)
    } catch (error) {
      if (!accessToken || !access.exp || access.exp <= now || authErrorStatus(error) === 401) throw error
    }
  }
  if (!accessToken) {
    clearAuthCookies(event)
    throw createError({ statusCode: 401, message: 'Sesiunea a expirat.' })
  }

  try {
    const data = await fetchUserSession<T>(event, accessToken)
    if (refreshToken) setAuthCookies(event, { accessToken, refreshToken })
    return envelope({ accessToken, refreshToken: refreshToken || accessToken }, data)
  } catch (error) {
    if (authErrorStatus(error) === 401 && refreshToken) return refreshedSession<T>(event, refreshToken)
    if (authErrorStatus(error) === 401) clearAuthCookies(event)
    throw error
  }
}

export async function refreshSession<T>(event: H3Event): Promise<SessionEnvelope<T>> {
  const refreshToken = getCookie(event, 'auth.refresh-token')
  if (!refreshToken) {
    clearAuthCookies(event)
    throw createError({ statusCode: 401, message: 'Refresh token inexistent.' })
  }
  return refreshedSession<T>(event, refreshToken)
}

export async function signIn<T>(event: H3Event, credentials: unknown): Promise<SessionEnvelope<T>> {
  const tokens = await backendFetch<AuthTokens>(event, '/auth/signin', { method: 'POST', body: credentials })
  setAuthCookies(event, tokens)
  return envelope(tokens, await fetchUserSession<T>(event, tokens.accessToken))
}

export async function signUp(event: H3Event, credentials: unknown): Promise<unknown> {
  return backendFetch(event, '/auth/signup', { method: 'POST', body: credentials })
}

export async function switchProfile<T>(event: H3Event, profileId: string): Promise<SessionEnvelope<T>> {
  const accessToken = getCookie(event, 'auth.token')
  const refreshToken = getCookie(event, 'auth.refresh-token')
  if (!accessToken || !refreshToken) {
    clearAuthCookies(event)
    throw createError({ statusCode: 401, message: 'Sesiunea a expirat.' })
  }
  const tokens = await backendFetch<AuthTokens>(event, '/auth/switch-profile', {
    method: 'POST', accessToken, body: { profileId, refreshToken }
  })
  setAuthCookies(event, tokens)
  return envelope(tokens, await fetchUserSession<T>(event, tokens.accessToken))
}

export async function signOut(event: H3Event): Promise<{ success: true }> {
  const refreshToken = getCookie(event, 'auth.refresh-token')
  try {
    if (refreshToken) await backendFetch(event, '/auth/signout', { method: 'POST', body: { refreshToken } })
  } finally {
    clearAuthCookies(event)
  }
  return { success: true }
}

export function assertSameOrigin(event: H3Event): void {
  const origin = getHeader(event, 'origin')
  if (!origin) return
  const forwarded = getHeader(event, 'x-forwarded-host')?.split(',')[0]?.trim()
  const host = forwarded || getHeader(event, 'host')
  try {
    if (!host || new URL(origin).host !== host) throw new Error('Origin mismatch')
  } catch {
    throw createError({ statusCode: 403, message: 'Originea cererii nu este permisă.' })
  }
}
