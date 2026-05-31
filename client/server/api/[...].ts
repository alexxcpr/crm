import { proxyRequest, getCookie } from 'h3'

export default defineEventHandler(async (event) => {
  // Only proxy in dev mode; in production the API is served by the same server or via external URL
  if (!import.meta.dev) {
    throw createError({ statusCode: 404 })
  }

  const config = useRuntimeConfig(event)
  const target = `${config.apiBaseInternal}${event.path.replace('/api', '')}`

  // Forward auth token from cookie as Authorization header.
  // @sidebase/nuxt-auth stores the JWT in a cookie named "auth.token".
  // During SSR the module forwards it, but depending on how Nitro
  // creates the synthetic event for internal $fetch calls, the header
  // may not reach the backend. This ensures it always does.
  const headers: Record<string, string> = {}
  const authToken = getCookie(event, 'auth.token')
  if (authToken) {
    headers['authorization'] = `Bearer ${authToken}`
  }

  try {
    return await proxyRequest(event, target, { headers })
  } catch {
    throw createError({
      statusCode: 502,
      statusMessage: 'Backend unavailable. Make sure the server is running on port 4000.'
    })
  }
})
