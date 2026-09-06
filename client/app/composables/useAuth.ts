import type { ModuvisSession } from './useProfiles'
import { broadcastAuthEvent, type AuthChannelEvent } from '~/utils/authChannel'

export interface AuthSessionEnvelope {
  data: ModuvisSession
  accessExpiresAt: string
  sessionExpiresAt: string
}

interface AuthCallOptions {
  callbackUrl?: string
  redirect?: boolean
  replace?: boolean
  callGetSession?: boolean
}

interface AuthRuntimeState {
  sessionPromise?: Promise<ModuvisSession | null>
  refreshPromise?: Promise<ModuvisSession>
}

function responseStatus(error: unknown): number {
  const candidate = error as { statusCode?: number, status?: number, response?: { status?: number } }
  return candidate?.statusCode ?? candidate?.status ?? candidate?.response?.status ?? 500
}

export function useAuth() {
  const data = useState<ModuvisSession | null | undefined>('auth:data', () => undefined)
  const loading = useState<boolean>('auth:loading', () => false)
  const accessExpiresAt = useState<string | null>('auth:access-expires-at', () => null)
  const sessionExpiresAt = useState<string | null>('auth:session-expires-at', () => null)
  const status = computed<'loading' | 'authenticated' | 'unauthenticated'>(() => {
    if (loading.value || data.value === undefined) return 'loading'
    return data.value ? 'authenticated' : 'unauthenticated'
  })
  const nuxtApp = useNuxtApp() as ReturnType<typeof useNuxtApp> & { _moduvisAuth?: AuthRuntimeState }
  nuxtApp._moduvisAuth ??= {}

  function applyEnvelope(envelope: AuthSessionEnvelope): ModuvisSession {
    data.value = envelope.data
    accessExpiresAt.value = envelope.accessExpiresAt
    sessionExpiresAt.value = envelope.sessionExpiresAt
    return envelope.data
  }

  function clearLocalSession(): void {
    data.value = null
    accessExpiresAt.value = null
    sessionExpiresAt.value = null
    clearEntitySchemaCache()
    clearNuxtState(key => key.startsWith('schema-') || key.startsWith('navigation-menu-'))
  }

  async function authFetch<T>(path: string, options: Record<string, unknown> = {}): Promise<T> {
    if (import.meta.client) {
      return $fetch<T>(path, { credentials: 'include', ...options } as any)
    }

    const event = useRequestEvent()
    const response = await $fetch.raw<T>(path, {
      credentials: 'include',
      headers: useRequestHeaders(['cookie', 'host', 'x-forwarded-host', 'x-tenant']),
      ...options
    } as any)
    if (event) {
      const { appendResponseHeader } = await import('h3')
      for (const cookie of response.headers.getSetCookie()) {
        appendResponseHeader(event, 'set-cookie', cookie)
        const match = /^auth\.token=([^;]*)/.exec(cookie)
        if (match?.[1]) event.context.moduvisAccessToken = decodeURIComponent(match[1])
      }
    }
    return response._data as T
  }

  async function getSession(options: { force?: boolean } = {}): Promise<ModuvisSession | null> {
    if (!options.force && data.value !== undefined) return data.value
    if (nuxtApp._moduvisAuth!.sessionPromise) return nuxtApp._moduvisAuth!.sessionPromise

    loading.value = true
    const previous = data.value
    const promise = authFetch<AuthSessionEnvelope>('/_auth/session')
      .then(applyEnvelope)
      .catch((error) => {
        if (responseStatus(error) === 401) {
          clearLocalSession()
          return null
        }
        data.value = previous
        throw error
      })
      .finally(() => {
        loading.value = false
        nuxtApp._moduvisAuth!.sessionPromise = undefined
      })
    nuxtApp._moduvisAuth!.sessionPromise = promise
    return promise
  }

  async function refresh(options: { broadcast?: boolean } = {}): Promise<ModuvisSession> {
    if (nuxtApp._moduvisAuth!.refreshPromise) return nuxtApp._moduvisAuth!.refreshPromise

    const previous = data.value
    const promise = authFetch<AuthSessionEnvelope>('/_auth/refresh', { method: 'POST' })
      .then((envelope) => {
        const session = applyEnvelope(envelope)
        if (options.broadcast !== false) broadcastAuthEvent('session-refreshed')
        return session
      })
      .catch((error) => {
        if (responseStatus(error) === 401) clearLocalSession()
        else data.value = previous
        throw error
      })
      .finally(() => {
        nuxtApp._moduvisAuth!.refreshPromise = undefined
      })
    nuxtApp._moduvisAuth!.refreshPromise = promise
    return promise
  }

  async function signIn(credentials: { loginUsername: string, password: string }, options: AuthCallOptions = {}) {
    loading.value = true
    try {
      const envelope = await authFetch<AuthSessionEnvelope>('/_auth/signin', {
        method: 'POST',
        body: credentials
      })
      applyEnvelope(envelope)
      broadcastAuthEvent('signed-in')
      if (options.redirect !== false) await navigateTo(options.callbackUrl || '/', { replace: options.replace })
      return envelope
    } finally {
      loading.value = false
    }
  }

  async function signUp(credentials: unknown, options: AuthCallOptions = {}) {
    const response = await authFetch('/_auth/signup', { method: 'POST', body: credentials })
    if (options.redirect !== false) await navigateTo(options.callbackUrl || '/login')
    return response
  }

  async function signOut(options: AuthCallOptions = {}) {
    try {
      await authFetch('/_auth/signout', { method: 'POST' })
    } finally {
      clearLocalSession()
      broadcastAuthEvent('signed-out')
    }
    if (options.redirect !== false) {
      await navigateTo(options.callbackUrl || '/login', { replace: options.replace ?? true })
    }
  }

  async function replaceSession(envelope: AuthSessionEnvelope, event: AuthChannelEvent): Promise<ModuvisSession> {
    const session = applyEnvelope(envelope)
    broadcastAuthEvent(event)
    return session
  }

  return {
    data: readonly(data),
    status,
    loading: readonly(loading),
    accessExpiresAt: readonly(accessExpiresAt),
    sessionExpiresAt: readonly(sessionExpiresAt),
    getSession,
    refresh,
    signIn,
    signUp,
    signOut,
    replaceSession,
    clearLocalSession
  }
}
