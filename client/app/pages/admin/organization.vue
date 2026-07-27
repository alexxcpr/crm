<script setup lang="ts">
definePageMeta({ middleware: ['capability'], requiredCapability: 'tenant.manage' })

interface OrganizationSettings {
  organizationName: string
  logoFileId: string | null
  logoUrl: string | null
  primaryColor: string
  locale: string
  timezone: string
  dateFormat: string
  defaultCurrency: string
}

interface UploadSession {
  file: { idFile: string }
  uploadUrl: string | null
  uploadHeaders: Record<string, string>
}

const { apiFetch } = useApi()
const { uploadToUrl } = useFiles()
const { fetchBranding } = useTenantBranding()
const toast = useToast()
const saving = ref(false)
const uploading = ref(false)
const previewUrl = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const colors = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose']
const localeOptions = [
  { label: 'Romana', value: 'ro-RO' },
  { label: 'English (UK)', value: 'en-GB' },
  { label: 'English (US)', value: 'en-US' }
]
const dateFormatOptions = ['dd.MM.yyyy', 'dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd']
const currencyOptions = ['RON', 'EUR', 'USD', 'GBP']
const timezoneOptions = (typeof Intl.supportedValuesOf === 'function'
  ? Intl.supportedValuesOf('timeZone')
  : ['Europe/Bucharest', 'Europe/London', 'UTC'])
  .map(value => ({ label: value, value }))

const response = await apiFetch<{ data: OrganizationSettings }>('/v1/admin/settings/organization')
const state = reactive<OrganizationSettings>({ ...response.data })
previewUrl.value = state.logoUrl

async function save() {
  saving.value = true
  try {
    const updated = await apiFetch<{ data: OrganizationSettings }>('/v1/admin/settings/organization', {
      method: 'PUT',
      body: state
    })
    Object.assign(state, updated.data)
    previewUrl.value = state.logoUrl
    await fetchBranding(true)
    toast.add({ title: 'Configurarea organizatiei a fost salvata', color: 'success' })
  } finally {
    saving.value = false
  }
}

async function selectLogo(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
    toast.add({ title: 'Logo invalid', description: 'Foloseste PNG, JPEG sau WebP de maximum 2 MB.', color: 'error' })
    return
  }

  uploading.value = true
  try {
    const session = await apiFetch<{ data: UploadSession }>('/v1/admin/settings/organization/logo/upload-sessions', {
      method: 'POST',
      body: {
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        idempotencyKey: crypto.randomUUID()
      }
    })
    if (session.data.uploadUrl) {
      await uploadToUrl(session.data.uploadUrl, file, session.data.uploadHeaders, () => {})
    }
    await apiFetch(`/v1/admin/settings/organization/logo/upload-sessions/${session.data.file.idFile}/complete`, {
      method: 'POST'
    })
    state.logoFileId = session.data.file.idFile
    if (previewUrl.value?.startsWith('blob:')) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = URL.createObjectURL(file)
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

function removeLogo() {
  state.logoFileId = null
  previewUrl.value = null
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-lg font-semibold">
        Organizatie
      </h2>
      <p class="text-sm text-muted">
        Brandingul si formatele implicite folosite in acest tenant.
      </p>
    </div>

    <UPageCard title="Identitate vizuala" variant="subtle">
      <div class="grid gap-6 lg:grid-cols-[12rem_1fr]">
        <div class="space-y-3">
          <div class="flex h-28 items-center justify-center rounded-lg border border-default bg-white p-3">
            <img v-if="previewUrl" :src="previewUrl" :alt="state.organizationName" class="max-h-full max-w-full object-contain">
            <UIcon v-else name="i-lucide-building-2" class="size-10 text-muted" />
          </div>
          <input
            ref="fileInput"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            class="hidden"
            @change="selectLogo"
          >
          <div class="flex gap-2">
            <UButton label="Logo" icon="i-lucide-upload" size="sm" :loading="uploading" @click="fileInput?.click()" />
            <UButton v-if="previewUrl" icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click="removeLogo" />
          </div>
        </div>

        <div class="space-y-4">
          <UFormField label="Nume afisat" required>
            <UInput v-model="state.organizationName" maxlength="100" class="w-full" />
          </UFormField>
          <UFormField label="Culoare principala">
            <USelect v-model="state.primaryColor" :items="colors" class="w-full" />
          </UFormField>
        </div>
      </div>
    </UPageCard>

    <UPageCard title="Localizare si formate" description="Textele interfetei raman in romana in aceasta versiune." variant="subtle">
      <div class="grid gap-4 md:grid-cols-2">
        <UFormField label="Locale pentru formatare">
          <USelect v-model="state.locale" :items="localeOptions" value-key="value" label-key="label" class="w-full" />
        </UFormField>
        <UFormField label="Fus orar">
          <USelectMenu v-model="state.timezone" :items="timezoneOptions" value-key="value" class="w-full" />
        </UFormField>
        <UFormField label="Format data">
          <USelect v-model="state.dateFormat" :items="dateFormatOptions" class="w-full" />
        </UFormField>
        <UFormField label="Moneda implicita">
          <USelect v-model="state.defaultCurrency" :items="currencyOptions" class="w-full" />
        </UFormField>
      </div>
    </UPageCard>

    <div class="flex justify-end">
      <UButton label="Salveaza configurarile" icon="i-lucide-save" :loading="saving" @click="save" />
    </div>
  </div>
</template>
