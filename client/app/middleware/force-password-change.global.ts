export default defineNuxtRouteMiddleware((to) => {
  const { data, status } = useAuth()
  const session = data.value as { must_change_password?: boolean } | null
  if (status.value === 'authenticated' && session?.must_change_password && to.path !== '/settings/security') {
    return navigateTo('/settings/security')
  }
})
