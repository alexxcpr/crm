import type { GlobalCapability } from '~/composables/useAccess'

export default defineNuxtRouteMiddleware((to) => {
  const required = to.meta.requiredCapability as GlobalCapability | undefined
  if (!required) return

  const { can } = useAccess()
  if (!can(required)) {
    return abortNavigation(createError({
      statusCode: 403,
      statusMessage: 'Nu ai acces la aceasta zona.'
    }))
  }
})
