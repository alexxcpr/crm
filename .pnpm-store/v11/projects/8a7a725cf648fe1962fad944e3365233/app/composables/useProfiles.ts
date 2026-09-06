export interface SessionProfile {
  id_profile: string
  username: string
  email: string
  display_name: string | null
  is_default?: boolean
}

export interface ModuvisSession {
  id: string
  login_username: string
  must_change_password: boolean
  profileId: string
  profile: SessionProfile
  profiles: SessionProfile[]
  roles: string[]
  accessLevel: 'platform_owner' | 'tenant_admin' | 'user'
  globalCapabilities: string[]
  capabilities: Record<string, Record<string, 'all' | 'owner' | null>>
  billing?: {
    billingStatus: string
    profileSeats: number
    storageQuotaGb: number
    features: Record<string, boolean>
  } | null
  features?: Record<string, boolean>
}

export function useProfiles() {
  const { data, replaceSession } = useAuth()
  const session = computed(() => data.value as ModuvisSession | null)

  function label(profile?: SessionProfile | null) {
    return profile?.display_name || profile?.username || profile?.email || 'Profil'
  }

  async function switchProfile(profileId: string) {
    const response = await $fetch<import('./useAuth').AuthSessionEnvelope>('/_auth/switch-profile', {
      method: 'POST',
      credentials: 'include',
      body: { profileId }
    })
    clearEntitySchemaCache()
    clearNuxtState(key => key.startsWith('schema-'))
    return replaceSession(response, 'profile-changed')
  }

  return { session, label, switchProfile }
}
