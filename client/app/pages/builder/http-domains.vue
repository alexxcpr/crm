<script setup lang="ts">
definePageMeta({ middleware: ['capability'], requiredCapability: 'builder.manage' })

const toast = useToast()
const {
  domains,
  loading,
  error,
  fetchDomains,
  createDomain,
  updateDomain,
  deleteDomain
} = useWorkflowHttpDomains()
const form = reactive({ name: '', hostname: '', port: '' })

await fetchDomains()

async function addDomain() {
  const ok = await createDomain({
    name: form.name,
    hostname: form.hostname,
    ...(form.port ? { port: Number(form.port) } : {})
  })
  toast.add(ok
    ? { title: 'Domeniu HTTP aprobat', color: 'success' }
    : { title: 'Domeniul nu a fost aprobat', description: error.value ?? '', color: 'error' })
  if (ok) Object.assign(form, { name: '', hostname: '', port: '' })
}

async function toggleDomain(domain: any) {
  await updateDomain(domain.id_domain, { isActive: !domain.is_active })
}

async function removeDomain(domain: any) {
  const ok = await deleteDomain(domain.id_domain)
  toast.add(ok
    ? { title: 'Domeniu eliminat', color: 'success' }
    : { title: 'Domeniul nu a fost eliminat', description: error.value ?? '', color: 'error' })
}
</script>

<template>
  <section class="space-y-5">
    <div>
      <h2 class="text-lg font-semibold">
        Domenii HTTP aprobate
      </h2>
      <p class="text-sm text-muted">
        Nodurile HTTP pot apela numai hostname-uri active din aceasta lista.
      </p>
    </div>

    <div class="grid gap-2 md:grid-cols-[1fr_1.5fr_8rem_auto]">
      <UInput v-model="form.name" placeholder="Denumire" />
      <UInput v-model="form.hostname" placeholder="api.exemplu.ro" />
      <UInput v-model="form.port" type="number" placeholder="Port optional" />
      <UButton
        label="Aproba"
        icon="i-lucide-shield-check"
        :disabled="!form.name || !form.hostname"
        :loading="loading"
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
      <p v-if="!loading && domains.length === 0" class="p-4 text-sm text-muted">
        Nu exista domenii HTTP aprobate.
      </p>
    </div>
  </section>
</template>
