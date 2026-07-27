import type { ModuvisSession } from './useProfiles'

export type GlobalCapability =
  | 'builder.manage'
  | 'tenant.manage'
  | 'access_levels.manage'
  | 'billing.manage'
  | 'data.manage_all'

export function useAccess() {
  const { data } = useAuth()
  const session = computed(
    () => data.value as ModuvisSession | null
  )

  function can(capability: GlobalCapability) {
    return session.value?.globalCapabilities?.includes(capability) ?? false
  }

  const canUseBuilder = computed(() => can('builder.manage'))
  const canManageTenant = computed(() => can('tenant.manage'))
  const canManageAccessLevels = computed(() => can('access_levels.manage'))
  const canManageBilling = computed(() => can('billing.manage'))

  return {
    session,
    can,
    canUseBuilder,
    canManageTenant,
    canManageAccessLevels,
    canManageBilling
  }
}
