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
  const { data } = useAuth()
  const { apiFetch } = useApi()
  const session = computed(() => data.value as ModuvisSession | null)

  function label(profile?: SessionProfile | null) {
    return profile?.display_name || profile?.username || profile?.email || 'Profil'
  }

  async function switchProfile(profileId: string) {
    const rawRefreshToken = useState<string | null>('auth:raw-refresh-token')
    const response = await apiFetch<{ accessToken: string, refreshToken: string }>('/auth/switch-profile', {
      method: 'POST',
      body: { profileId, refreshToken: rawRefreshToken.value }
    })
    useState<string | null>('auth:raw-token').value = response.accessToken
    rawRefreshToken.value = response.refreshToken
    const fresh = await apiFetch<ModuvisSession>('/user/me')
    clearEntitySchemaCache()
    useState<ModuvisSession | null>('auth:data').value = fresh
    clearNuxtState((key) => key.startsWith('schema-'))
    return fresh
  }

  return { session, label, switchProfile }
}
