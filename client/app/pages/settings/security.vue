<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

const { apiFetch } = useApi()
const { session } = useProfiles()
const { signOut } = useAuth()
const toast = useToast()
const account = reactive({ loginUsername: '', currentPassword: '' })
const password = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' })
watch(session, value => { account.loginUsername = value?.login_username ?? '' }, { immediate: true })

const accountSchema = z.object({ loginUsername: z.string().min(2), currentPassword: z.string().min(1) })
const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
  confirmPassword: z.string().min(1)
}).refine(value => value.newPassword === value.confirmPassword, { path: ['confirmPassword'], message: 'Parolele nu coincid' })

async function updateAccount(event: FormSubmitEvent<typeof account>) {
  await apiFetch('/user/me/account', { method: 'PUT', body: event.data })
  toast.add({ title: 'Username actualizat. Autentifica-te din nou.', color: 'success' })
  await signOut({ callbackUrl: '/login' })
}

async function updatePassword(event: FormSubmitEvent<typeof password>) {
  await apiFetch('/user/me/password', { method: 'PUT', body: event.data })
  toast.add({ title: 'Parola actualizata. Autentifica-te din nou.', color: 'success' })
  await signOut({ callbackUrl: '/login' })
}
</script>

<template>
  <div class="space-y-6">
    <UPageCard title="Credential de autentificare" description="Username-ul contului este separat de username-ul profilului." variant="subtle">
      <UForm :schema="accountSchema" :state="account" class="space-y-4 max-w-sm" @submit="updateAccount">
        <UFormField label="Login username" name="loginUsername"><UInput v-model="account.loginUsername" class="w-full" /></UFormField>
        <UFormField label="Parola curenta" name="currentPassword"><UInput v-model="account.currentPassword" type="password" class="w-full" /></UFormField>
        <UButton type="submit" label="Schimba username-ul" />
      </UForm>
    </UPageCard>
    <UPageCard title="Parola" description="Schimbarea parolei inchide toate sesiunile active." variant="subtle">
      <UForm :schema="passwordSchema" :state="password" class="space-y-4 max-w-sm" @submit="updatePassword">
        <UFormField label="Parola curenta" name="currentPassword"><UInput v-model="password.currentPassword" type="password" class="w-full" /></UFormField>
        <UFormField label="Parola noua" name="newPassword"><UInput v-model="password.newPassword" type="password" class="w-full" /></UFormField>
        <UFormField label="Confirma parola" name="confirmPassword"><UInput v-model="password.confirmPassword" type="password" class="w-full" /></UFormField>
        <UButton type="submit" label="Schimba parola" />
      </UForm>
    </UPageCard>
  </div>
</template>
