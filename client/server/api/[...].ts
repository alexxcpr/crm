import { proxyRequest } from 'h3'

export default defineEventHandler(async (event) => {
  // Only proxy in dev mode; in production the API is served by the same server or via external URL
  if (!import.meta.dev) {
    throw createError({ statusCode: 404 })
  }

  const config = useRuntimeConfig(event)
  const target = `${config.apiBaseInternal}${event.path.replace('/api', '')}`

  try {
    return await proxyRequest(event, target)
  } catch {
    throw createError({
      statusCode: 502,
      statusMessage: 'Backend unavailable. Make sure the server is running on port 4000.'
    })
  }
})
