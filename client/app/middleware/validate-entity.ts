const knownSlugs = new Set<string>()

export default defineNuxtRouteMiddleware(async (to) => {
  const entitySlug = to.params.entity as string | undefined
  if (!entitySlug) return

  const staticRoutes = ['settings', 'inbox', 'dashboard', 'login', 'register', 'modules', 'entities']
  if (staticRoutes.includes(entitySlug)) return

  if (knownSlugs.has(entitySlug)) return

  try {
    const { apiFetch } = useApi()
    await apiFetch(`/v1/schema/${entitySlug}`)
    knownSlugs.add(entitySlug)
  }
  catch {
    return abortNavigation({
      statusCode: 404,
      message: `Entitatea "${entitySlug}" nu exista.`
    })
  }
})
