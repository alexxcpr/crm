<script setup lang="ts">
import * as z from 'zod'

const { apiFetch } = useApi()
const { session, label } = useProfiles()
const toast = useToast()
const schema = z.object({
  displayName: z.string().max(200).optional(),
  username: z.string().min(2),
  email: z.string().email()
})
const state = reactive({ displayName: '', username: '', email: '' })
const defaultProfileId = ref('')

watch(session, (value) => {
  if (!value) return
  state.displayName = value.profile.display_name ?? ''
  state.username = value.profile.username
  state.email = value.profile.email
  defaultProfileId.value = value.profiles.find(profile => profile.is_default)?.id_profile ?? value.profileId
}, { immediate: true })

async function save() {
  await apiFetch('/user/me/profile', { method: 'PUT', body: state })
  useState<any>('auth:data').value = await apiFetch('/user/me')
  toast.add({ title: 'Profil actualizat', color: 'success' })
}

async function saveDefault() {
  await apiFetch('/user/me/default-profile', { method: 'PUT', body: { profileId: defaultProfileId.value } })
  useState<any>('auth:data').value = await apiFetch('/user/me')
  toast.add({ title: 'Profil implicit actualizat', color: 'success' })
}
</script>

<template>
  <div class="space-y-6">
    <UForm :schema="schema" :state="state" @submit="save">
      <UPageCard title="Profil activ" description="Identitatea folosita in aplicatie si pentru ownership." variant="subtle">
        <div class="space-y-4 max-w-md">
          <UFormField label="Nume afisat" name="displayName"><UInput v-model="state.displayName" class="w-full" /></UFormField>
          <UFormField label="Username profil" name="username" required><UInput v-model="state.username" class="w-full" /></UFormField>
          <UFormField label="Email profil" name="email" required><UInput v-model="state.email" type="email" class="w-full" /></UFormField>
          <UButton type="submit" label="Salveaza profilul" />
        </div>
      </UPageCard>
    </UForm>

    <UPageCard title="Profil implicit" description="Acest profil este selectat automat dupa autentificare." variant="subtle">
      <div class="flex gap-3 max-w-md">
        <USelectMenu v-model="defaultProfileId" :items="session?.profiles.map(profile => ({ label: label(profile), value: profile.id_profile })) ?? []" value-key="value" class="flex-1" />
        <UButton label="Seteaza" color="neutral" @click="saveDefault" />
      </div>
    </UPageCard>
  </div>
</template>
