<script setup lang="ts">
type Role = { id_role: string, name: string, slug: string, is_system: boolean, permissions: Permission[] }
type Permission = { id_entity: string, action: string, scope: 'all' | 'owner' | null }
type Profile = { id_profile: string, username: string, email: string, display_name: string | null, is_active: boolean, roles: Role[], roleIds: string[] }
type User = { id: string, login_username: string, is_active: boolean, profiles: Profile[] }
type Entity = { id_entity: string, name: string, slug: string }

const { apiFetch } = useApi()
const toast = useToast()
const users = ref<User[]>([])
const roles = ref<Role[]>([])
const entities = ref<Entity[]>([])
const activeTab = ref<'users' | 'roles'>('users')
const tabItems = [
  { label: 'Conturi si profiluri', value: 'users' },
  { label: 'Roluri si permisiuni', value: 'roles' }
]
const actions = ['read', 'create', 'update', 'delete', 'manage', 'change_ownership']
const scopedActions = new Set(['read', 'update', 'delete', 'manage'])
const permissionScopeOptions = [
  { label: '-', value: '' },
  { label: 'Owner', value: 'owner' },
  { label: 'All', value: 'all' }
]
const roleOptions = computed(() => roles.value.map(role => ({ label: role.name, value: role.id_role })))
const userOptions = computed(() => users.value.map(user => ({ label: user.login_username, value: user.id })))

const newUser = reactive({ loginUsername: '', temporaryPassword: '', profile: { username: '', email: '', displayName: '', roleIds: [] as string[] } })
const newProfile = reactive({ userId: '', username: '', email: '', displayName: '', roleIds: [] as string[] })
const roleForm = reactive({ id: '', name: '', slug: '', description: '', permissions: {} as Record<string, string> })
const showDeleteRoleConfirm = ref(false)
const deletingRole = ref(false)
const selectedRole = computed(() => roles.value.find(role => role.id_role === roleForm.id) ?? null)

async function load() {
  const [loadedUsers, loadedRoles, loadedEntities] = await Promise.all([
    apiFetch('/v1/admin/security/users'),
    apiFetch('/v1/admin/security/roles'),
    apiFetch<any>('/v1/admin/entities').then(response => response.data)
  ]) as [User[], Role[], Entity[]]
  users.value = loadedUsers.map(user => ({ ...user, profiles: user.profiles.map(profile => ({ ...profile, roleIds: profile.roles.map(role => role.id_role) })) }))
  roles.value = loadedRoles
  entities.value = loadedEntities
}
await load()

async function createUser() {
  await apiFetch('/v1/admin/security/users', { method: 'POST', body: newUser })
  Object.assign(newUser, { loginUsername: '', temporaryPassword: '', profile: { username: '', email: '', displayName: '', roleIds: [] } })
  await load()
  toast.add({ title: 'Cont creat', color: 'success' })
}

async function createProfile() {
  await apiFetch(`/v1/admin/security/users/${newProfile.userId}/profiles`, { method: 'POST', body: newProfile })
  Object.assign(newProfile, { userId: '', username: '', email: '', displayName: '', roleIds: [] })
  await load()
  toast.add({ title: 'Profil creat', color: 'success' })
}

async function saveProfile(profile: Profile) {
  await apiFetch(`/v1/admin/security/profiles/${profile.id_profile}`, {
    method: 'PUT',
    body: {
      username: profile.username,
      email: profile.email,
      displayName: profile.display_name,
      isActive: profile.is_active,
      roleIds: profile.roleIds
    }
  })
  await load()
  toast.add({ title: 'Profil actualizat', color: 'success' })
}

function permissionKey(entityId: string, action: string) { return `${entityId}:${action}` }

function editRole(role?: Role) {
  roleForm.id = role?.id_role ?? ''
  roleForm.name = role?.name ?? ''
  roleForm.slug = role?.slug ?? ''
  roleForm.description = ''
  roleForm.permissions = {}
  for (const permission of role?.permissions ?? []) roleForm.permissions[permissionKey(permission.id_entity, permission.action)] = permission.scope ?? 'enabled'
}

async function saveRole() {
  const permissions = Object.entries(roleForm.permissions).filter(([, value]) => value).map(([key, value]) => {
    const [idEntity, action] = key.split(':')
    return { idEntity, action, scope: scopedActions.has(action!) ? value : null }
  })
  const body = { name: roleForm.name, slug: roleForm.slug, description: roleForm.description, permissions }
  await apiFetch(roleForm.id ? `/v1/admin/security/roles/${roleForm.id}` : '/v1/admin/security/roles', { method: roleForm.id ? 'PUT' : 'POST', body })
  editRole()
  await load()
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
    editRole()
    await load()
    toast.add({ title: 'Rol sters', color: 'success' })
  }
  catch (err: any) {
    toast.add({
      title: 'Eroare la stergere',
      description: err?.data?.message || err.message || 'Rolul nu a putut fi sters.',
      color: 'error'
    })
  }
  finally {
    deletingRole.value = false
  }
}
</script>

<template>
  <div class="space-y-5">
    <UTabs v-model="activeTab" :items="tabItems" :content="false" />

    <template v-if="activeTab === 'users'">
      <div class="grid gap-4 xl:grid-cols-2">
        <UPageCard title="Cont nou" description="Creeaza contul si profilul implicit cu parola temporara." variant="subtle">
          <div class="grid gap-3 sm:grid-cols-2">
            <UInput v-model="newUser.loginUsername" placeholder="Login username" />
            <UInput v-model="newUser.temporaryPassword" type="password" placeholder="Parola temporara" />
            <UInput v-model="newUser.profile.displayName" placeholder="Nume afisat" />
            <UInput v-model="newUser.profile.username" placeholder="Username profil" />
            <UInput v-model="newUser.profile.email" type="email" placeholder="Email profil" />
            <USelectMenu v-model="newUser.profile.roleIds" multiple :items="roleOptions" value-key="value" placeholder="Roluri" />
          </div>
          <template #footer><UButton label="Creeaza cont" @click="createUser" /></template>
        </UPageCard>

        <UPageCard title="Profil suplimentar" variant="subtle">
          <div class="grid gap-3 sm:grid-cols-2">
            <USelectMenu v-model="newProfile.userId" :items="userOptions" value-key="value" placeholder="Cont" />
            <UInput v-model="newProfile.displayName" placeholder="Nume afisat" />
            <UInput v-model="newProfile.username" placeholder="Username profil" />
            <UInput v-model="newProfile.email" type="email" placeholder="Email profil" />
            <USelectMenu v-model="newProfile.roleIds" multiple :items="roleOptions" value-key="value" placeholder="Roluri" />
          </div>
          <template #footer><UButton label="Adauga profil" @click="createProfile" /></template>
        </UPageCard>
      </div>

      <UPageCard v-for="user in users" :key="user.id" :title="user.login_username" variant="subtle">
        <div class="space-y-3">
          <div v-for="profile in user.profiles" :key="profile.id_profile" class="grid gap-2 rounded-lg border border-default p-3 lg:grid-cols-[1fr_1fr_1fr_2fr_auto_auto]">
            <UInput v-model="profile.display_name" placeholder="Nume afisat" />
            <UInput v-model="profile.username" />
            <UInput v-model="profile.email" type="email" />
            <USelectMenu v-model="profile.roleIds" multiple :items="roles" label-key="name" value-key="id_role" />
            <UCheckbox v-model="profile.is_active" label="Activ" />
            <UButton label="Salveaza" size="sm" @click="saveProfile(profile)" />
          </div>
        </div>
      </UPageCard>
    </template>

    <template v-else>
      <div class="flex flex-wrap gap-2">
        <UButton label="Rol nou" icon="i-lucide-plus" @click="editRole()" />
        <UButton v-for="role in roles" :key="role.id_role" :label="role.name" color="neutral" variant="outline" @click="editRole(role)" />
      </div>
      <UPageCard :title="roleForm.id ? 'Editeaza rol' : 'Rol nou'" variant="subtle">
        <div class="grid gap-3 sm:grid-cols-3">
          <UInput v-model="roleForm.name" placeholder="Nume" />
          <UInput v-model="roleForm.slug" placeholder="slug" :disabled="!!roleForm.id" />
          <UInput v-model="roleForm.description" placeholder="Descriere" />
        </div>
        <div class="mt-5 overflow-auto">
          <table class="w-full text-sm">
            <thead><tr><th class="p-2 text-left">Entitate</th><th v-for="action in actions" :key="action" class="p-2 text-left">{{ action }}</th></tr></thead>
            <tbody>
              <tr v-for="entity in entities" :key="entity.id_entity" class="border-t border-default">
                <td class="p-2 font-medium">{{ entity.name }}</td>
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
        <template #footer>
          <div class="flex w-full items-center justify-between gap-3">
            <UButton
              v-if="selectedRole && !selectedRole.is_system"
              label="Sterge rolul"
              icon="i-lucide-trash-2"
              color="error"
              variant="outline"
              @click="confirmDeleteRole"
            />
            <span v-else />
            <UButton label="Salveaza rolul" @click="saveRole" />
          </div>
        </template>
      </UPageCard>
    </template>

    <UModal
      v-model:open="showDeleteRoleConfirm"
      title="Confirmare stergere"
      description="Rolul va fi eliminat si din profilurile care il folosesc."
    >
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
  </div>
</template>
