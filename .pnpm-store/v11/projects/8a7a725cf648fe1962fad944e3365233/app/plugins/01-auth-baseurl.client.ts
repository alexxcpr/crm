/**
 * Ensures client-side auth calls use the public /api base (via Traefik),
 * not the Docker-internal URL that may leak from SSR payload.
 */
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  config.public.auth.baseURL = config.public.apiBase as string
})
