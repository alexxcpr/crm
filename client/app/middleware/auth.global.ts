export default defineNuxtRouteMiddleware(async (to) => {
  const { data, getSession } = useAuth()
  const isGuestPage = to.path === '/login' || to.path === '/register'

  try {
    await getSession()
  } catch {
    if (isGuestPage) return
    throw createError({
      statusCode: 503,
      statusMessage: 'Serviciul este temporar indisponibil',
      message: 'Sesiunea nu a putut fi verificată. Încearcă din nou fără să te autentifici din nou.'
    })
  }

  if (isGuestPage && data.value) return navigateTo('/dashboard')
  if (!isGuestPage && !data.value) return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
})
