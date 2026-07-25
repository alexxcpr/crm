<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { SmtpIntegration } from '~/types/admin'

const { integrations, loading, error, fetchIntegrations, updateIntegration, testIntegration, deleteIntegration } = useAdminIntegrations()
const toast = useToast()
await fetchIntegrations(true)
const {
  domains,
  loading: domainsLoading,
  error: domainsError,
  fetchDomains,
  createDomain,
  updateDomain,
  deleteDomain
} = useWorkflowHttpDomains()
await fetchDomains()

const showForm = ref(false)
const editing = ref<SmtpIntegration | null>(null)
const testing = ref<SmtpIntegration | null>(null)
const testTo = ref('')
const deleting = ref<SmtpIntegration | null>(null)
const replacementId = ref('')
const domainForm = reactive({ name: '', hostname: '', port: '' })

const replacementOptions = computed(() => integrations.value
  .filter(item => item.is_active && item.id_integration !== deleting.value?.id_integration)
  .map(item => ({ label: `${item.name} (${item.fromEmail})`, value: item.id_integration })))

const columns: TableColumn<SmtpIntegration>[] = [
  { accessorKey: 'name', header: 'Nume' },
  { accessorKey: 'host', header: 'Server SMTP' },
  { accessorKey: 'fromEmail', header: 'Expeditor' },
  { accessorKey: 'security', header: 'Securitate' },
  { accessorKey: 'usageCount', header: 'Workflow-uri' },
  { accessorKey: 'is_active', header: 'Stare' },
  { id: 'actions', header: '' }
]

function openCreate() {
  editing.value = null
  showForm.value = true
}

function openEdit(item: SmtpIntegration) {
  editing.value = item
  showForm.value = true
}

function openDelete(item: SmtpIntegration) {
  deleting.value = item
  replacementId.value = ''
}

async function toggleActive(item: SmtpIntegration) {
  const result = await updateIntegration(item.id_integration, { isActive: !item.is_active })
  toast.add(result
    ? { title: result.is_active ? 'Integrare activata' : 'Integrare dezactivata', color: 'success' }
    : { title: 'Starea nu a fost schimbata', description: error.value ?? '', color: 'error' })
}

async function sendTest() {
  if (!testing.value || !testTo.value) return
  const ok = await testIntegration(testing.value.id_integration, testTo.value)
  toast.add(ok
    ? { title: 'Email de test trimis', color: 'success' }
    : { title: 'Testul SMTP a esuat', description: error.value ?? '', color: 'error' })
  if (ok) {
    testing.value = null
    testTo.value = ''
  }
}

async function confirmDelete() {
  if (!deleting.value) return
  if (deleting.value.usageCount > 0 && !replacementId.value) {
    toast.add({ title: 'Alege integrarea inlocuitoare', color: 'error' })
    return
  }
  const ok = await deleteIntegration(deleting.value.id_integration, replacementId.value || undefined)
  toast.add(ok
    ? { title: 'Integrare stearsa', color: 'success' }
    : { title: 'Integrarea nu a fost stearsa', description: error.value ?? '', color: 'error' })
  if (ok) deleting.value = null
}

function menuItems(item: SmtpIntegration) {
  return [[
    { label: 'Editeaza', icon: 'i-lucide-pencil', onClick: () => openEdit(item) },
    { label: 'Trimite email de test', icon: 'i-lucide-send', disabled: !item.is_active, onClick: () => { testing.value = item } },
    { label: item.is_active ? 'Dezactiveaza' : 'Activeaza', icon: item.is_active ? 'i-lucide-pause' : 'i-lucide-play', onClick: () => toggleActive(item) }
  ], [
    { label: 'Sterge', icon: 'i-lucide-trash-2', color: 'error' as const, onClick: () => openDelete(item) }
  ]]
}

async function addDomain() {
  const ok = await createDomain({
    name: domainForm.name,
    hostname: domainForm.hostname,
    ...(domainForm.port ? { port: Number(domainForm.port) } : {})
  })
  toast.add(ok
    ? { title: 'Domeniu HTTP aprobat', color: 'success' }
    : { title: 'Domeniul nu a fost aprobat', description: domainsError.value ?? '', color: 'error' })
  if (ok) Object.assign(domainForm, { name: '', hostname: '', port: '' })
}

async function toggleDomain(domain: any) {
  await updateDomain(domain.id_domain, { isActive: !domain.is_active })
}

async function removeDomain(domain: any) {
  const ok = await deleteDomain(domain.id_domain)
  toast.add(ok
    ? { title: 'Domeniu eliminat', color: 'success' }
    : { title: 'Domeniul nu a fost eliminat', description: domainsError.value ?? '', color: 'error' })
}
</script>

<template>
  <div>
    <div class="mb-4 flex items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold">
          Integrari
        </h2><p class="text-sm text-muted">
          Configureaza serviciile externe folosite de workflow-uri.
        </p>
      </div>
      <UButton label="Adauga SMTP" icon="i-lucide-plus" @click="openCreate" />
    </div>

    <UTable
      :data="integrations"
      :columns="columns"
      :loading="loading"
      class="w-full"
    >
      <template #host-cell="{ row }">
        <span>{{ row.original.host }}:{{ row.original.port }}</span>
      </template>
      <template #security-cell="{ row }">
        <UBadge :label="row.original.security.toUpperCase()" color="neutral" variant="subtle" />
      </template>
      <template #usageCount-cell="{ row }">
        <UBadge :label="String(row.original.usageCount)" color="neutral" variant="subtle" />
      </template>
      <template #is_active-cell="{ row }">
        <UBadge :label="row.original.is_active ? 'Activ' : 'Inactiv'" :color="row.original.is_active ? 'success' : 'neutral'" variant="subtle" />
      </template>
      <template #actions-cell="{ row }">
        <UDropdownMenu :items="menuItems(row.original)">
          <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" />
        </UDropdownMenu>
      </template>
    </UTable>

    <UEmpty
      v-if="!loading && integrations.length === 0"
      icon="i-lucide-plug"
      title="Nicio integrare"
      description="Adauga primul cont SMTP pentru a trimite emailuri din workflow-uri."
      class="py-12"
    >
      <template #actions>
        <UButton label="Adauga SMTP" icon="i-lucide-plus" @click="openCreate" />
      </template>
    </UEmpty>

    <USeparator class="my-8" />

    <section class="space-y-4">
      <div>
        <h3 class="font-semibold">
          Domenii HTTP aprobate
        </h3>
        <p class="text-sm text-muted">
          Nodurile HTTP pot apela numai hostname-uri active din aceasta lista. Subdomeniile si porturile nestandard se aproba separat.
        </p>
      </div>
      <div class="grid gap-2 md:grid-cols-[1fr_1.5fr_8rem_auto]">
        <UInput v-model="domainForm.name" placeholder="Denumire" />
        <UInput v-model="domainForm.hostname" placeholder="api.exemplu.ro" />
        <UInput v-model="domainForm.port" type="number" placeholder="Port optional" />
        <UButton
          label="Aproba"
          icon="i-lucide-shield-check"
          :disabled="!domainForm.name || !domainForm.hostname"
          :loading="domainsLoading"
          @click="addDomain"
        />
      </div>
      <div class="divide-y divide-default rounded-lg border border-default">
        <div
          v-for="domain in domains"
          :key="domain.id_domain"
          class="flex items-center justify-between gap-3 p-3"
        >
          <div>
            <p class="font-medium">
              {{ domain.name }}
            </p>
            <p class="text-sm text-muted">
              {{ domain.hostname }}{{ domain.port ? `:${domain.port}` : ' (80/443)' }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <USwitch
              :model-value="domain.is_active"
              @update:model-value="toggleDomain(domain)"
            />
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              @click="removeDomain(domain)"
            />
          </div>
        </div>
        <p v-if="!domainsLoading && domains.length === 0" class="p-4 text-sm text-muted">
          Nu exista domenii HTTP aprobate.
        </p>
      </div>
    </section>

    <UModal v-model:open="showForm" :title="editing ? 'Editeaza integrarea SMTP' : 'Integrare SMTP noua'">
      <template #body>
        <AdminSmtpIntegrationForm :integration="editing" @saved="showForm = false" @cancel="showForm = false" />
      </template>
    </UModal>

    <UModal :open="!!testing" title="Trimite email de test" @update:open="value => { if (!value) testing = null }">
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-muted">
            Mesajul va fi trimis prin {{ testing?.name }}.
          </p><UFormField label="Destinatar" required>
            <UInput
              v-model="testTo"
              type="email"
              placeholder="email@exemplu.ro"
              class="w-full"
            />
          </UFormField><div class="flex justify-end gap-2">
            <UButton
              label="Anuleaza"
              color="neutral"
              variant="outline"
              @click="testing = null"
            /><UButton
              label="Trimite test"
              icon="i-lucide-send"
              :loading="loading"
              @click="sendTest"
            />
          </div>
        </div>
      </template>
    </UModal>

    <UModal :open="!!deleting" title="Sterge integrarea SMTP" @update:open="value => { if (!value) deleting = null }">
      <template #body>
        <div class="space-y-4">
          <p>Esti sigur ca vrei sa stergi <strong>{{ deleting?.name }}</strong>?</p>
          <UFormField
            v-if="deleting?.usageCount"
            label="Integrare inlocuitoare"
            :description="`${deleting.usageCount} workflow-uri vor primi automat o revizie noua.`"
            required
          >
            <USelect
              v-model="replacementId"
              :items="replacementOptions"
              value-key="value"
              label-key="label"
              placeholder="Alege un cont SMTP activ"
              class="w-full"
            />
          </UFormField>
          <UAlert
            v-if="deleting?.usageCount && replacementOptions.length === 0"
            color="warning"
            title="Nu exista alta integrare activa"
            description="Creeaza sau activeaza mai intai un alt cont SMTP."
          />
          <div class="flex justify-end gap-2">
            <UButton
              label="Anuleaza"
              color="neutral"
              variant="outline"
              @click="deleting = null"
            /><UButton
              label="Sterge si inlocuieste"
              color="error"
              icon="i-lucide-trash-2"
              :disabled="!!deleting?.usageCount && !replacementId"
              :loading="loading"
              @click="confirmDelete"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
