import { subscribeToAuthEvents } from '~/utils/authChannel'

const REFRESH_EARLY_MS = 60_000
const RETRY_AFTER_FAILURE_MS = 15_000

export default defineNuxtPlugin(() => {
  const nuxtApp = useNuxtApp()
  const { data, accessExpiresAt, getSession, refresh, clearLocalSession } = useAuth()
  let timer: ReturnType<typeof setTimeout> | undefined

  async function refreshInBackground() {
    try {
      await refresh()
    } catch (error: any) {
      const status = error?.statusCode ?? error?.status ?? error?.response?.status
      if (status === 401) await navigateTo('/login', { replace: true })
      else schedule(RETRY_AFTER_FAILURE_MS)
    }
  }

  function schedule(delayOverride?: number) {
    if (timer) clearTimeout(timer)
    if (!data.value || !accessExpiresAt.value) return
    const delay = delayOverride ?? Math.max(
      0,
      new Date(accessExpiresAt.value).getTime() - Date.now() - REFRESH_EARLY_MS
    )
    timer = setTimeout(refreshInBackground, delay)
  }

  watch([data, accessExpiresAt], () => schedule(), { immediate: true })
  const unsubscribe = subscribeToAuthEvents(async (event) => {
    if (event === 'signed-out') {
      clearLocalSession()
      await navigateTo('/login', { replace: true })
      return
    }
    try {
      const session = await getSession({ force: true })
      if (!session) await navigateTo('/login', { replace: true })
    } catch {
      // O eroare tranzitorie din alt tab nu invalidează sesiunea locală.
    }
  })
  const onVisibilityChange = () => {
    if (document.visibilityState !== 'visible' || !accessExpiresAt.value) return
    if (new Date(accessExpiresAt.value).getTime() - Date.now() <= REFRESH_EARLY_MS) void refreshInBackground()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  const originalUnmount = nuxtApp.vueApp.unmount
  nuxtApp.vueApp.unmount = function moduvisAuthUnmount() {
    if (timer) clearTimeout(timer)
    unsubscribe()
    document.removeEventListener('visibilitychange', onVisibilityChange)
    originalUnmount()
  }
})
