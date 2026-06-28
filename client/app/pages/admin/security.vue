<script setup lang="ts">
type Permission = { id_entity: string, action: string, scope: 'all' | 'owner' | null }
type Role = { id_role: string, name: string, slug: string, description?: string | null, is_system: boolean, permissions: Permission[] }
type Profile = { id_profile: string, username: string, email: string, display_name: string | null, is_active: boolean, roles: Role[], roleIds: string[] }
type User = { id: string, login_username: string, is_active: boolean, profiles: Profile[] }
type Entity = { id_entity: string, name: string, slug: string }
type EntityListResponse = { data: Entity[] }
type RoleGroup = {
  id_role_group: string
  name: string
  description: string | null
  roles: Role[]
  profiles: Array<Profile & { login_username?: string }>
  date_created: string
  date_updated: string
}

const { apiFetch } = useApi()
const toast = useToast()

const users = ref<User[]>([])
const roles = ref<Role[]>([])
const entities = ref<Entity[]>([])
const roleGroups = ref<RoleGroup[]>([])
const activeTab = ref<'profiles' | 'roles' | 'roleGroups'>('profiles')
const activeRoleId = ref('')
const activeRoleGroupId = ref('')

const showUserModal = ref(false)
const showProfileModal = ref(false)
const showProfileEditSlideover = ref(false)
const showDeleteRoleConfirm = ref(false)
const showApplyRoleGroupModal = ref(false)
const loadingApply = ref(false)
const deletingRole = ref(false)
const savingProfile = ref(false)
const profileSearch = ref('')
const entitySearch = ref('')
const roleGroupSearch = ref('')

const tabs = [
  { label: 'Profiluri', value: 'profiles', icon: 'i-lucide-users' },
  { label: 'Roluri', value: 'roles', icon: 'i-lucide-shield-check' },
  { label: 'Grupuri de roluri', value: 'roleGroups', icon: 'i-lucide-layers-3' }
]

const actions = ['read', 'create', 'update', 'delete', 'manage', 'change_ownership'] as const
const actionLabels: Record<string, string> = {
  read: 'Citire',
  create: 'Creare',
  update: 'Editare',
  delete: 'Stergere',
  manage: 'Manage',
  change_ownership: 'Owner'
}
const scopedActions = new Set(['read', 'update', 'delete', 'manage'])
const permissionScopeOptions = [
  { label: '-', value: '' },
  { label: 'Proprii', value: 'owner' },
  { label: 'Toate', value: 'all' }
]

const newUser = reactive({ loginUsername: '', temporaryPassword: '', profile: { username: '', email: '', displayName: '', roleIds: [] as string[] } })
const newProfile = reactive({ userId: '', username: '', email: '', displayName: '', roleIds: [] as string[] })
const profileForm = reactive({ id: '', loginUsername: '', displayName: '', username: '', email: '', roleIds: [] as string[], isActive: true })
const roleForm = reactive({ id: '', name: '', slug: '', description: '', permissions: {} as Record<string, string> })
const roleGroupForm = reactive({ id: '', name: '', description: '', roleIds: [] as string[], profileIds: [] as string[] })

const selectedRole = computed(() => roles.value.find(role => role.id_role === roleForm.id) ?? null)
const selectedRoleGroup = computed(() => roleGroups.value.find(group => group.id_role_group === activeRoleGroupId.value) ?? null)
const roleOptions = computed(() => roles.value.map(role => ({ label: role.name, value: role.id_role })))
const userOptions = computed(() => users.value.map(user => ({ label: user.login_username, value: user.id })))
const allProfiles = computed(() => users.value.flatMap(user => user.profiles.map(profile => ({ ...profile, login_username: user.login_username }))))
const profileOptions = computed(() => allProfiles.value.map(profile => ({
  label: `${profile.display_name || profile.username} (${profile.login_username})`,
  value: profile.id_profile
})))
const activeProfilesCount = computed(() => allProfiles.value.filter(profile => profile.is_active).length)
const systemRolesCount = computed(() => roles.value.filter(role => role.is_system).length)
const filteredProfiles = computed(() => {
  const query = profileSearch.value.trim().toLowerCase()
  if (!query) return allProfiles.value
  return allProfiles.value.filter(profile => [
    profile.login_username,
    profile.display_name,
    profile.username,
    profile.email,
    ...profile.roles.map(role => role.name)
  ].filter(Boolean).some(value => String(value).toLowerCase().includes(query)))
})
const filteredEntities = computed(() => {
  const query = entitySearch.value.trim().toLowerCase()
  if (!query) return entities.value
  return entities.value.filter(entity => `${entity.name} ${entity.slug}`.toLowerCase().includes(query))
})
const filteredRoleGroups = computed(() => {
  const query = roleGroupSearch.value.trim().toLowerCase()
  if (!query) return roleGroups.value
  return roleGroups.value.filter(group => `${group.name} ${group.description ?? ''}`.toLowerCase().includes(query))
})

function profileLabel(profile: Profile) {
  return profile.display_name || profile.username || profile.email || 'Profil fara nume'
}

function profileInitials(profile: Profile) {
  return profileLabel(profile)
    .split(/\s+/)
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

const profileFormInitials = computed(() => {
  const label = profileForm.displayName || profileForm.username || profileForm.email || 'Profil fara nume'
  return label
    .split(/\s+/)
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
})

function profileRoleLabels(profile: Profile) {
  const assignedRoleIds = new Set(profile.roleIds ?? [])
  const labels = roles.value
    .filter(role => assignedRoleIds.has(role.id_role))
    .map(role => role.name)

  if (labels.length) return labels
  return profile.roles.map(role => role.name)
}

function errorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== 'object') return fallback

  const apiError = error as { data?: { message?: unknown }, message?: unknown }
  if (typeof apiError.data?.message === 'string') return apiError.data.message
  if (typeof apiError.message === 'string') return apiError.message

  return fallback
}

async function load() {
  const [loadedUsers, loadedRoles, loadedEntities, loadedRoleGroups] = await Promise.all([
    apiFetch('/v1/admin/security/users'),
    apiFetch('/v1/admin/security/roles'),
    apiFetch<EntityListResponse>('/v1/admin/entities').then(response => response.data),
    apiFetch('/v1/admin/security/role-groups')
  ]) as [User[], Role[], Entity[], RoleGroup[]]

  users.value = loadedUsers.map(user => ({
    ...user,
    profiles: user.profiles.map(profile => ({ ...profile, roleIds: profile.roles.map(role => role.id_role) }))
  }))
  roles.value = loadedRoles
  entities.value = loadedEntities
  roleGroups.value = loadedRoleGroups

  if (!activeRoleId.value && roles.value[0]) editRole(roles.value[0])
  if (activeRoleId.value && !roles.value.some(role => role.id_role === activeRoleId.value)) editRole(roles.value[0])
  if (!activeRoleGroupId.value && roleGroups.value[0]) editRoleGroup(roleGroups.value[0])
  if (activeRoleGroupId.value && !roleGroups.value.some(group => group.id_role_group === activeRoleGroupId.value)) editRoleGroup(roleGroups.value[0])
}
await load()

function resetNewUser() {
  Object.assign(newUser, { loginUsername: '', temporaryPassword: '', profile: { username: '', email: '', displayName: '', roleIds: [] } })
}

function resetNewProfile() {
  Object.assign(newProfile, { userId: '', username: '', email: '', displayName: '', roleIds: [] })
}

async function createUser() {
  await apiFetch('/v1/admin/security/users', { method: 'POST', body: newUser })
  resetNewUser()
  showUserModal.value = false
  await load()
  toast.add({ title: 'Cont creat', color: 'success' })
}

async function createProfile() {
  await apiFetch(`/v1/admin/security/users/${newProfile.userId}/profiles`, { method: 'POST', body: newProfile })
  resetNewProfile()
  showProfileModal.value = false
  await load()
  toast.add({ title: 'Profil creat', color: 'success' })
}

function openProfileEditor(profile: Profile & { login_username?: string }) {
  profileForm.id = profile.id_profile
  profileForm.loginUsername = profile.login_username ?? ''
  profileForm.displayName = profile.display_name ?? ''
  profileForm.username = profile.username
  profileForm.email = profile.email
  profileForm.roleIds = [...profile.roleIds]
  profileForm.isActive = profile.is_active
  showProfileEditSlideover.value = true
}

async function saveProfileForm() {
  if (!profileForm.id) return
  savingProfile.value = true
  try {
    await apiFetch(`/v1/admin/security/profiles/${profileForm.id}`, {
      method: 'PUT',
      body: {
        username: profileForm.username,
        email: profileForm.email,
        displayName: profileForm.displayName,
        isActive: profileForm.isActive,
        roleIds: profileForm.roleIds
      }
    })
    await load()
    showProfileEditSlideover.value = false
    toast.add({ title: 'Profil actualizat', color: 'success' })
  } finally {
    savingProfile.value = false
  }
}

function permissionKey(entityId: string, action: string) {
  return `${entityId}:${action}`
}

function editRole(role?: Role) {
  activeRoleId.value = role?.id_role ?? ''
  roleForm.id = role?.id_role ?? ''
  roleForm.name = role?.name ?? ''
  roleForm.slug = role?.slug ?? ''
  roleForm.description = role?.description ?? ''
  roleForm.permissions = {}
  for (const permission of role?.permissions ?? []) {
    roleForm.permissions[permissionKey(permission.id_entity, permission.action)] = permission.scope ?? 'enabled'
  }
}

function newRole() {
  activeRoleId.value = ''
  editRole()
}

async function saveRole() {
  const permissions = Object.entries(roleForm.permissions).filter(([, value]) => value).map(([key, value]) => {
    const [idEntity, action] = key.split(':')
    return { idEntity, action, scope: scopedActions.has(action!) ? value : null }
  })
  const body = { name: roleForm.name, slug: roleForm.slug, description: roleForm.description, permissions }
  const role = await apiFetch<Role>(roleForm.id ? `/v1/admin/security/roles/${roleForm.id}` : '/v1/admin/security/roles', {
    method: roleForm.id ? 'PUT' : 'POST',
    body
  })
  await load()
  editRole(role)
  toast.add({ title: 'Rol salvat', color: 'success' })
}

function confirmDeleteRole() {
  if (!selectedRole.value || selectedRole.value.is_system) return
  showDeleteRoleConfirm.value = true
}

async function deleteRole() {
  if (!selectedRole.value || selectedRole.value.is_system) return
  deletingRole.value = true
  try {
    await apiFetch(`/v1/admin/security/roles/${selectedRole.value.id_role}`, { method: 'DELETE' })
    showDeleteRoleConfirm.value = false
    await load()
    newRole()
    toast.add({ title: 'Rol sters', color: 'success' })
  } catch (err: unknown) {
    toast.add({ title: 'Eroare la stergere', description: errorMessage(err, 'Rolul nu a putut fi sters.'), color: 'error' })
  } finally {
    deletingRole.value = false
  }
}

function editRoleGroup(group?: RoleGroup) {
  activeRoleGroupId.value = group?.id_role_group ?? ''
  roleGroupForm.id = group?.id_role_group ?? ''
  roleGroupForm.name = group?.name ?? ''
  roleGroupForm.description = group?.description ?? ''
  roleGroupForm.roleIds = group?.roles.map(role => role.id_role) ?? []
  roleGroupForm.profileIds = group?.profiles.map(profile => profile.id_profile) ?? []
}

function newRoleGroup() {
  editRoleGroup()
}

async function saveRoleGroup() {
  const body = {
    name: roleGroupForm.name,
    description: roleGroupForm.description,
    roleIds: roleGroupForm.roleIds,
    profileIds: roleGroupForm.profileIds
  }
  const group = await apiFetch<RoleGroup>(roleGroupForm.id ? `/v1/admin/security/role-groups/${roleGroupForm.id}` : '/v1/admin/security/role-groups', {
    method: roleGroupForm.id ? 'PUT' : 'POST',
    body
  })
  await load()
  editRoleGroup(group)
  toast.add({ title: 'Grup de roluri salvat', color: 'success' })
}

async function deleteRoleGroup() {
  if (!roleGroupForm.id) return
  await apiFetch(`/v1/admin/security/role-groups/${roleGroupForm.id}`, { method: 'DELETE' })
  await load()
  newRoleGroup()
  toast.add({ title: 'Grup de roluri sters', color: 'success' })
}

async function applyRoleGroup(mode: 'add' | 'replace') {
  if (!selectedRoleGroup.value) return
  loadingApply.value = true
  try {
    const result = await apiFetch<{ updatedProfiles: number, mode: 'add' | 'replace' }>(`/v1/admin/security/role-groups/${selectedRoleGroup.value.id_role_group}/apply`, {
      method: 'POST',
      body: { mode }
    })
    showApplyRoleGroupModal.value = false
    await load()
    const label = result.mode === 'replace' ? 'inlocuite' : 'adaugate'
    toast.add({ title: 'Grup de roluri aplicat', description: `Roluri ${label} pentru ${result.updatedProfiles} profiluri.`, color: 'success' })
  } catch (err: unknown) {
    toast.add({ title: 'Eroare la aplicare', description: errorMessage(err, 'Grupul de roluri nu a putut fi aplicat.'), color: 'error' })
  } finally {
    loadingApply.value = false
  }
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h2 class="text-lg font-semibold">
          Securitate
        </h2>
        <p class="text-sm text-muted">
          Gestioneaza profiluri, roluri si grupuri de roluri fara sa modifici modelul de autorizare.
        </p>
      </div>

      <p class="text-sm text-muted">
        {{ activeProfilesCount }} profiluri active | {{ roles.length }} roluri | {{ roleGroups.length }} grupuri de roluri
      </p>
    </div>

    <UTabs v-model="activeTab" :items="tabs" :content="false" />

    <section v-if="activeTab === 'profiles'" class="space-y-4">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <UInput
          v-model="profileSearch"
          icon="i-lucide-search"
          placeholder="Cauta profil, cont sau rol"
          class="md:w-80"
        />
        <div class="flex flex-wrap gap-2">
          <UButton
            label="Cont nou"
            icon="i-lucide-user-plus"
            color="neutral"
            variant="outline"
            @click="showUserModal = true"
          />
          <UButton label="Profil suplimentar" icon="i-lucide-plus" @click="showProfileModal = true" />
        </div>
      </div>

      <div class="overflow-hidden rounded-md border border-default">
        <div class="hidden grid-cols-[minmax(16rem,1.4fr)_minmax(10rem,.75fr)_minmax(14rem,1fr)_7rem_auto] gap-4 border-b border-default px-4 py-2.5 text-xs font-medium uppercase text-muted xl:grid">
          <span>Profil</span>
          <span>Cont login</span>
          <span>Roluri</span>
          <span>Status</span>
          <span />
        </div>
        <div v-for="profile in filteredProfiles" :key="profile.id_profile" class="grid gap-3 border-b border-default px-4 py-3 last:border-b-0 xl:grid-cols-[minmax(16rem,1.4fr)_minmax(10rem,.75fr)_minmax(14rem,1fr)_7rem_auto] xl:items-center">
          <div class="flex min-w-0 items-center gap-3">
            <UAvatar :alt="profileLabel(profile)" :text="profileInitials(profile)" size="sm" />
            <div class="min-w-0">
              <div class="truncate text-sm font-medium">
                {{ profileLabel(profile) }}
              </div>
              <div class="truncate text-xs text-muted">
                {{ profile.email || profile.username }}
              </div>
            </div>
          </div>

          <div class="min-w-0 text-sm">
            <span class="block truncate font-medium">{{ profile.login_username }}</span>
            <span class="block text-xs text-muted xl:hidden">cont login</span>
          </div>

          <div class="flex min-w-0 flex-wrap gap-1.5">
            <UBadge
              v-for="roleName in profileRoleLabels(profile)"
              :key="roleName"
              :label="roleName"
              color="neutral"
              variant="subtle"
              size="md"
              class="px-2.5 py-1 text-sm"
            />
            <span v-if="profileRoleLabels(profile).length === 0" class="text-sm text-muted">
              Fara roluri
            </span>
          </div>

          <div>
            <UBadge
              v-if="profile.is_active"
              label="Activ"
              color="success"
              variant="subtle"
              size="md"
              class="px-2.5 py-1 text-sm"
            />
            <UBadge
              v-else
              label="Inactiv"
              color="neutral"
              variant="subtle"
              size="md"
              class="px-2.5 py-1 text-sm"
            />
          </div>

          <div class="flex justify-end">
            <UTooltip text="Editeaza profil">
              <UButton
                icon="i-lucide-pencil"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="Editeaza profil"
                @click="openProfileEditor(profile)"
              />
            </UTooltip>
          </div>
        </div>
      </div>

      <UEmpty
        v-if="filteredProfiles.length === 0"
        icon="i-lucide-users"
        title="Niciun profil"
        description="Nu exista profiluri pentru cautarea curenta."
      />
    </section>

    <USlideover
      v-model:open="showProfileEditSlideover"
      title="Editeaza profil"
      :description="profileForm.loginUsername"
      :ui="{ content: 'max-w-lg' }"
    >
      <template #body>
        <div class="space-y-5">
          <div class="flex items-center gap-3">
            <UAvatar :alt="profileForm.displayName || profileForm.username" :text="profileFormInitials" size="md" />
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold">
                {{ profileForm.displayName || profileForm.username || 'Profil fara nume' }}
              </div>
              <div class="truncate text-xs text-muted">
                {{ profileForm.email || profileForm.loginUsername }}
              </div>
            </div>
          </div>

          <div class="rounded-md border border-default px-3 py-2">
            <div class="text-xs text-muted">
              Cont login
            </div>
            <div class="text-sm font-medium">
              {{ profileForm.loginUsername }}
            </div>
          </div>

          <UFormField label="Nume afisat">
            <UInput v-model="profileForm.displayName" placeholder="Ex: Ana Popescu" />
          </UFormField>

          <UFormField label="Username profil">
            <UInput v-model="profileForm.username" placeholder="Ex: ana.popescu" />
          </UFormField>

          <UFormField label="Email profil">
            <UInput v-model="profileForm.email" type="email" placeholder="ana@firma.ro" />
          </UFormField>

          <UFormField label="Roluri">
            <USelectMenu
              v-model="profileForm.roleIds"
              multiple
              :items="roleOptions"
              value-key="value"
              placeholder="Alege roluri"
            />
          </UFormField>

          <UCheckbox v-model="profileForm.isActive" label="Profil activ" />

          <div class="flex justify-end gap-2 pt-2">
            <UButton
              label="Anuleaza"
              color="neutral"
              variant="outline"
              @click="showProfileEditSlideover = false"
            />
            <UButton
              label="Salveaza"
              icon="i-lucide-save"
              :loading="savingProfile"
              @click="saveProfileForm"
            />
          </div>
        </div>
      </template>
    </USlideover>

    <section v-if="activeTab === 'roles'" class="grid gap-4 xl:grid-cols-[18rem_1fr]">
      <aside class="space-y-3">
        <div class="flex items-center justify-between gap-2">
          <div>
            <h3 class="text-sm font-semibold">
              Roluri
            </h3>
            <p class="text-xs text-muted">
              {{ systemRolesCount }} roluri de sistem
            </p>
          </div>
          <UButton
            icon="i-lucide-plus"
            label="Nou"
            size="sm"
            @click="newRole"
          />
        </div>
        <div class="overflow-hidden rounded-md border border-default">
          <button
            v-for="role in roles"
            :key="role.id_role"
            type="button"
            class="flex w-full items-center justify-between gap-3 border-b border-default px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted"
            :class="roleForm.id === role.id_role ? 'bg-muted' : ''"
            @click="editRole(role)"
          >
            <span class="min-w-0">
              <span class="block truncate font-medium">{{ role.name }}</span>
              <span class="block truncate text-xs text-muted">{{ role.slug }}</span>
            </span>
            <UBadge
              v-if="role.is_system"
              label="System"
              color="warning"
              variant="subtle"
              size="sm"
            />
          </button>
        </div>
      </aside>

      <div class="space-y-4">
        <div class="rounded-md border border-default p-4">
          <div class="grid gap-3 lg:grid-cols-[1fr_1fr_2fr_auto] lg:items-end">
            <UInput v-model="roleForm.name" placeholder="Nume rol" />
            <UInput v-model="roleForm.slug" placeholder="slug" :disabled="!!roleForm.id" />
            <UInput v-model="roleForm.description" placeholder="Descriere" />
            <UButton label="Salveaza rolul" icon="i-lucide-save" @click="saveRole" />
          </div>
        </div>

        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <UInput
            v-model="entitySearch"
            icon="i-lucide-search"
            placeholder="Cauta entitate"
            class="md:w-80"
          />
          <UButton
            v-if="selectedRole && !selectedRole.is_system"
            label="Sterge rolul"
            icon="i-lucide-trash-2"
            color="error"
            variant="outline"
            @click="confirmDeleteRole"
          />
        </div>

        <div class="overflow-auto rounded-md border border-default">
          <table class="w-full min-w-[760px] text-sm">
            <thead class="bg-muted">
              <tr>
                <th class="sticky left-0 bg-muted p-2 text-left font-medium">
                  Entitate
                </th>
                <th v-for="action in actions" :key="action" class="p-2 text-left font-medium">
                  {{ actionLabels[action] }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entity in filteredEntities" :key="entity.id_entity" class="border-t border-default">
                <td class="sticky left-0 bg-default p-2 font-medium">
                  <div>{{ entity.name }}</div>
                  <div class="text-xs font-normal text-muted">
                    {{ entity.slug }}
                  </div>
                </td>
                <td v-for="action in actions" :key="action" class="p-2">
                  <select
                    v-if="scopedActions.has(action)"
                    v-model="roleForm.permissions[permissionKey(entity.id_entity, action)]"
                    class="h-8 w-24 rounded-md border border-default bg-default px-2 text-sm text-highlighted outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <option v-for="option in permissionScopeOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                  <UCheckbox
                    v-else
                    :model-value="roleForm.permissions[permissionKey(entity.id_entity, action)] === 'enabled'"
                    @update:model-value="value => roleForm.permissions[permissionKey(entity.id_entity, action)] = value ? 'enabled' : ''"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section v-if="activeTab === 'roleGroups'" class="grid gap-4 xl:grid-cols-[20rem_1fr]">
      <aside class="space-y-3">
        <div class="flex items-center justify-between gap-2">
          <div>
            <h3 class="text-sm font-semibold">
              Grupuri de roluri
            </h3>
            <p class="text-xs text-muted">
              Aplica roluri pe profiluri selectate
            </p>
          </div>
          <UButton
            icon="i-lucide-plus"
            label="Nou"
            size="sm"
            @click="newRoleGroup"
          />
        </div>
        <UInput v-model="roleGroupSearch" icon="i-lucide-search" placeholder="Cauta grup" />
        <div class="overflow-hidden rounded-md border border-default">
          <button
            v-for="group in filteredRoleGroups"
            :key="group.id_role_group"
            type="button"
            class="block w-full border-b border-default px-3 py-2 text-left last:border-b-0 hover:bg-muted"
            :class="roleGroupForm.id === group.id_role_group ? 'bg-muted' : ''"
            @click="editRoleGroup(group)"
          >
            <span class="block truncate text-sm font-medium">{{ group.name }}</span>
            <span class="block text-xs text-muted">{{ group.roles.length }} roluri, {{ group.profiles.length }} profiluri</span>
          </button>
        </div>
      </aside>

      <div class="space-y-4">
        <div class="rounded-md border border-default p-4">
          <div class="grid gap-3 lg:grid-cols-[1fr_2fr_auto] lg:items-end">
            <UInput v-model="roleGroupForm.name" placeholder="Nume grup" />
            <UInput v-model="roleGroupForm.description" placeholder="Descriere" />
            <UButton label="Salveaza" icon="i-lucide-save" @click="saveRoleGroup" />
          </div>
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <div class="rounded-md border border-default p-4">
            <div class="mb-3 flex items-center justify-between">
              <h3 class="text-sm font-semibold">
                Roluri incluse
              </h3>
              <UBadge :label="String(roleGroupForm.roleIds.length)" color="neutral" variant="subtle" />
            </div>
            <USelectMenu
              v-model="roleGroupForm.roleIds"
              multiple
              :items="roleOptions"
              value-key="value"
              placeholder="Selecteaza roluri"
            />
          </div>

          <div class="rounded-md border border-default p-4">
            <div class="mb-3 flex items-center justify-between">
              <h3 class="text-sm font-semibold">
                Profiluri tinta
              </h3>
              <UBadge :label="String(roleGroupForm.profileIds.length)" color="neutral" variant="subtle" />
            </div>
            <USelectMenu
              v-model="roleGroupForm.profileIds"
              multiple
              :items="profileOptions"
              value-key="value"
              placeholder="Selecteaza profiluri"
            />
          </div>
        </div>

        <div class="flex flex-col gap-3 rounded-md border border-default p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div class="text-sm font-medium">
              Aplica grupul de roluri
            </div>
            <div class="text-sm text-muted">
              Rolurile vor fi scrise in profile_role pentru profilurile selectate.
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-if="roleGroupForm.id"
              label="Sterge"
              icon="i-lucide-trash-2"
              color="error"
              variant="outline"
              @click="deleteRoleGroup"
            />
            <UButton
              label="Aplica"
              icon="i-lucide-play"
              :disabled="!selectedRoleGroup"
              @click="showApplyRoleGroupModal = true"
            />
          </div>
        </div>
      </div>
    </section>

    <UModal v-model:open="showUserModal" title="Cont nou" description="Creeaza contul si profilul implicit cu parola temporara.">
      <template #body>
        <div class="grid gap-3 sm:grid-cols-2">
          <UInput v-model="newUser.loginUsername" placeholder="Login username" />
          <UInput v-model="newUser.temporaryPassword" type="password" placeholder="Parola temporara" />
          <UInput v-model="newUser.profile.displayName" placeholder="Nume afisat" />
          <UInput v-model="newUser.profile.username" placeholder="Username profil" />
          <UInput v-model="newUser.profile.email" type="email" placeholder="Email profil" />
          <USelectMenu
            v-model="newUser.profile.roleIds"
            multiple
            :items="roleOptions"
            value-key="value"
            placeholder="Roluri"
          />
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <UButton
            label="Anuleaza"
            color="neutral"
            variant="outline"
            @click="showUserModal = false"
          />
          <UButton label="Creeaza cont" icon="i-lucide-user-plus" @click="createUser" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="showProfileModal" title="Profil suplimentar">
      <template #body>
        <div class="grid gap-3 sm:grid-cols-2">
          <USelectMenu
            v-model="newProfile.userId"
            :items="userOptions"
            value-key="value"
            placeholder="Cont"
          />
          <UInput v-model="newProfile.displayName" placeholder="Nume afisat" />
          <UInput v-model="newProfile.username" placeholder="Username profil" />
          <UInput v-model="newProfile.email" type="email" placeholder="Email profil" />
          <USelectMenu
            v-model="newProfile.roleIds"
            multiple
            :items="roleOptions"
            value-key="value"
            placeholder="Roluri"
          />
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <UButton
            label="Anuleaza"
            color="neutral"
            variant="outline"
            @click="showProfileModal = false"
          />
          <UButton label="Adauga profil" icon="i-lucide-plus" @click="createProfile" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="showDeleteRoleConfirm" title="Confirmare stergere" description="Rolul va fi eliminat si din profilurile sau grupurile de roluri care il folosesc.">
      <template #body>
        <p>
          Esti sigur ca vrei sa stergi rolul
          <strong>{{ selectedRole?.name }}</strong>?
        </p>
        <div class="mt-4 flex items-center justify-end gap-3">
          <UButton
            label="Anuleaza"
            color="neutral"
            variant="outline"
            @click="showDeleteRoleConfirm = false"
          />
          <UButton
            label="Sterge"
            icon="i-lucide-trash-2"
            color="error"
            :loading="deletingRole"
            @click="deleteRole"
          />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="showApplyRoleGroupModal" title="Aplica grupul de roluri" :description="selectedRoleGroup?.name">
      <template #body>
        <div class="space-y-3">
          <button type="button" class="w-full rounded-md border border-default p-3 text-left hover:bg-muted" @click="applyRoleGroup('add')">
            <span class="block text-sm font-medium">Adauga rolurile</span>
            <span class="block text-sm text-muted">Pastreaza rolurile existente si adauga rolurile lipsa din grup.</span>
          </button>
          <button type="button" class="w-full rounded-md border border-default p-3 text-left hover:bg-muted" @click="applyRoleGroup('replace')">
            <span class="block text-sm font-medium">Inlocuieste rolurile</span>
            <span class="block text-sm text-muted">Profilurile tinta vor ramane exact cu rolurile din grup.</span>
          </button>
        </div>
        <div class="mt-4 flex justify-end">
          <UButton
            label="Anuleaza"
            color="neutral"
            variant="outline"
            :loading="loadingApply"
            @click="showApplyRoleGroupModal = false"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
