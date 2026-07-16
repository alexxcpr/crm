<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { SmtpIntegration, SmtpIntegrationPayload, SmtpSecurityMode } from '~/types/admin'

const props = defineProps<{ integration?: SmtpIntegration | null }>()
const emit = defineEmits<{ saved: [integration: SmtpIntegration], cancel: [] }>()

const isEdit = computed(() => !!props.integration)
const authEnabled = ref(!!props.integration?.username || !!props.integration?.hasPassword)
const securityOptions = [
  { label: 'Fara TLS', value: 'none' },
  { label: 'STARTTLS', value: 'starttls' },
  { label: 'TLS / SSL direct', value: 'tls' }
]

const schema = z.object({
  name: z.string().min(1, 'Numele este obligatoriu').max(120),
  host: z.string().min(1, 'Host-ul este obligatoriu').max(255),
  port: z.number().int().min(1).max(65535),
  security: z.enum(['none', 'starttls', 'tls']),
  username: z.string().max(255),
  password: z.string().max(2000),
  fromName: z.string().max(120),
  fromEmail: z.string().email('Email expeditor invalid').max(255),
  rejectUnauthorized: z.boolean(),
  isActive: z.boolean()
}).superRefine((data, context) => {
  if (data.port === 465 && data.security !== 'tls') {
    context.addIssue({
      code: 'custom',
      path: ['security'],
      message: 'Portul 465 necesita TLS / SSL direct.'
    })
  }

  if (data.host.trim().toLowerCase() === 'smtp.gmail.com') {
    const validGmailPair = (data.port === 465 && data.security === 'tls')
      || (data.port === 587 && data.security === 'starttls')
    if (!validGmailPair) {
      context.addIssue({
        code: 'custom',
        path: ['port'],
        message: 'Gmail accepta 465 + TLS direct sau 587 + STARTTLS.'
      })
    }
  }
})

type Schema = z.output<typeof schema>
const state = reactive<Schema>({
  name: props.integration?.name ?? '',
  host: props.integration?.host ?? '',
  port: props.integration?.port ?? 587,
  security: props.integration?.security ?? 'starttls',
  username: props.integration?.username ?? '',
  password: '',
  fromName: props.integration?.fromName ?? '',
  fromEmail: props.integration?.fromEmail ?? '',
  rejectUnauthorized: props.integration?.rejectUnauthorized ?? true,
  isActive: props.integration?.is_active ?? true
})

const smtpHint = computed(() => {
  if (state.host.trim().toLowerCase() === 'smtp.gmail.com') {
    return 'Gmail: port 465 cu TLS / SSL direct sau port 587 cu STARTTLS.'
  }
  if (state.port === 465) return 'Portul 465 foloseste obligatoriu TLS / SSL direct.'
  if (state.port === 587) return 'Portul 587 foloseste de regula STARTTLS.'
  return 'Verifica portul si modul de securitate recomandate de furnizorul SMTP.'
})

watch(() => state.port, (port) => {
  if (port === 465) state.security = 'tls'
  if (port === 587) state.security = 'starttls'
}, { immediate: true })

watch(() => state.security, (security) => {
  if (security === 'tls' && state.port === 587) state.port = 465
  if (security === 'starttls' && state.port === 465) state.port = 587
  if (security === 'none' && state.port === 465) state.port = 25
})

const { createIntegration, updateIntegration, loading, error } = useAdminIntegrations()
const toast = useToast()

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (authEnabled.value && (!event.data.username.trim() || (!isEdit.value && !event.data.password))) {
    toast.add({ title: 'Autentificare incompleta', description: 'Completeaza username-ul si parola SMTP.', color: 'error' })
    return
  }

  const payload: SmtpIntegrationPayload = {
    name: event.data.name,
    host: event.data.host,
    port: event.data.port,
    security: event.data.security as SmtpSecurityMode,
    username: authEnabled.value ? event.data.username : '',
    password: authEnabled.value && event.data.password ? event.data.password : undefined,
    clearPassword: !authEnabled.value,
    fromName: event.data.fromName || undefined,
    fromEmail: event.data.fromEmail,
    rejectUnauthorized: event.data.rejectUnauthorized,
    isActive: event.data.isActive
  }

  const result = isEdit.value && props.integration
    ? await updateIntegration(props.integration.id_integration, payload)
    : await createIntegration(payload)

  if (!result) {
    toast.add({ title: 'Integrarea nu a fost salvata', description: error.value ?? '', color: 'error' })
    return
  }
  toast.add({ title: isEdit.value ? 'Integrare actualizata' : 'Integrare creata', color: 'success' })
  emit('saved', result)
}
</script>

<template>
  <UForm
    :schema="schema"
    :state="state"
    class="space-y-4"
    @submit="onSubmit"
  >
    <UFormField label="Nume integrare" name="name" required>
      <UInput v-model="state.name" placeholder="ex: SMTP Vanzari" class="w-full" />
    </UFormField>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <UFormField
        label="Host"
        name="host"
        required
        class="sm:col-span-2"
      >
        <UInput v-model="state.host" placeholder="smtp.exemplu.ro" class="w-full" />
      </UFormField>
      <UFormField label="Port" name="port" required>
        <UInput
          v-model.number="state.port"
          type="number"
          :min="1"
          :max="65535"
          class="w-full"
        />
      </UFormField>
    </div>

    <UFormField
      label="Securitate"
      name="security"
      :description="smtpHint"
      required
    >
      <USelect
        v-model="state.security"
        :items="securityOptions"
        value-key="value"
        label-key="label"
        class="w-full"
      />
    </UFormField>

    <div class="rounded-lg border border-default p-3 space-y-3">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium">
            Autentificare SMTP
          </p>
          <p class="text-xs text-muted">
            Dezactiveaza pentru relay-uri care nu cer user si parola.
          </p>
        </div>
        <USwitch v-model="authEnabled" />
      </div>
      <template v-if="authEnabled">
        <UFormField label="Username" name="username" required>
          <UInput v-model="state.username" autocomplete="username" class="w-full" />
        </UFormField>
        <UFormField
          label="Parola"
          name="password"
          :required="!isEdit"
          :description="isEdit && integration?.hasPassword ? 'Lasa gol pentru a pastra parola existenta.' : undefined"
        >
          <UInput
            v-model="state.password"
            type="password"
            autocomplete="new-password"
            class="w-full"
          />
        </UFormField>
      </template>
    </div>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <UFormField label="Nume expeditor" name="fromName">
        <UInput v-model="state.fromName" placeholder="Moduvis" class="w-full" />
      </UFormField>
      <UFormField label="Email expeditor" name="fromEmail" required>
        <UInput
          v-model="state.fromEmail"
          type="email"
          placeholder="noreply@exemplu.ro"
          class="w-full"
        />
      </UFormField>
    </div>

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div class="flex items-center justify-between rounded-lg border border-default p-3">
        <div>
          <p class="text-sm font-medium">
            Valideaza certificatul
          </p><p class="text-xs text-muted">
            Recomandat in productie.
          </p>
        </div>
        <USwitch v-model="state.rejectUnauthorized" />
      </div>
      <div class="flex items-center justify-between rounded-lg border border-default p-3">
        <div>
          <p class="text-sm font-medium">
            Integrare activa
          </p><p class="text-xs text-muted">
            Poate fi selectata in workflow-uri.
          </p>
        </div>
        <USwitch v-model="state.isActive" />
      </div>
    </div>

    <div class="flex justify-end gap-2 border-t border-default pt-4">
      <UButton
        label="Anuleaza"
        color="neutral"
        variant="outline"
        @click="emit('cancel')"
      />
      <UButton
        type="submit"
        label="Salveaza"
        icon="i-lucide-check"
        :loading="loading"
      />
    </div>
  </UForm>
</template>
