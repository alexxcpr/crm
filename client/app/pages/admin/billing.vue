<script setup lang="ts">
const toast = useToast()
const {
  billing,
  loading,
  saving,
  error,
  fetchBilling,
  updateBilling,
  openCustomerPortal
} = useAdminBilling()

const profileSeatsDraft = ref(5)
const storageUnitsDraft = ref(0)
const reportsDashboardsDraft = ref(false)

const storagePrice = computed(() => billing.value?.storage.unitPriceEur ?? 1.5)
const storageUnitGb = computed(() => billing.value?.storage.unitGb ?? 10)
const extraStorageCost = computed(() => storageUnitsDraft.value * storagePrice.value)
const canDecreaseSeats = computed(() => {
  if (!billing.value) return true
  return profileSeatsDraft.value >= billing.value.profileSeats.active
})

watch(billing, (value) => {
  if (!value) return
  profileSeatsDraft.value = value.profileSeats.contracted
  storageUnitsDraft.value = value.storage.extraUnits
  reportsDashboardsDraft.value = value.features.reportsDashboards
}, { immediate: true })

async function saveBilling() {
  const ok = await updateBilling({
    profileSeats: profileSeatsDraft.value,
    extraStorageUnits: storageUnitsDraft.value,
    reportsDashboards: reportsDashboardsDraft.value
  })

  toast.add({
    title: ok ? 'Abonament actualizat' : 'Actualizarea a esuat',
    description: ok ? 'Modificarile au fost salvate.' : error.value || undefined,
    color: ok ? 'success' : 'error',
    icon: ok ? 'i-lucide-circle-check' : 'i-lucide-circle-alert'
  })
}

async function handlePortal() {
  try {
    await openCustomerPortal()
  }
  catch {
    toast.add({
      title: 'Nu am putut deschide portalul',
      description: 'Verifica daca tenantul are customer Stripe si daca portalul este configurat.',
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  }
}

onMounted(fetchBilling)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 class="text-2xl font-semibold tracking-normal text-highlighted">
          Abonament
        </h1>
        <p class="mt-1 text-sm text-muted">
          Administreaza profilele contractate, storage-ul si modulele platite pentru tenant.
        </p>
      </div>

      <UButton
        color="neutral"
        variant="soft"
        icon="i-lucide-receipt-text"
        :loading="saving"
        @click="handlePortal"
      >
        Facturi si card
      </UButton>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Nu am putut incarca abonamentul"
      :description="error"
    />

    <UProgress
      v-if="loading"
      animation="carousel"
    />

    <template v-if="billing">
      <div class="grid gap-4 lg:grid-cols-3">
        <UPageCard
          title="Status"
          :description="billing.tenant.subscriptionStatus || 'subscription activa'"
          variant="subtle"
        >
          <UBadge
            :color="billing.tenant.billingStatus === 'blocked' ? 'error' : 'success'"
            variant="subtle"
            icon="i-lucide-shield-check"
          >
            {{ billing.tenant.billingStatus }}
          </UBadge>
        </UPageCard>

        <UPageCard
          title="Profile active"
          :description="`${billing.profileSeats.active} din ${billing.profileSeats.contracted} contractate`"
          variant="subtle"
        >
          <UProgress
            :model-value="Math.round((billing.profileSeats.active / billing.profileSeats.contracted) * 100)"
            color="primary"
          />
        </UPageCard>

        <UPageCard
          title="Storage"
          :description="`${billing.storage.quotaGb} GB disponibili`"
          variant="subtle"
        >
          <p class="text-sm text-muted">
            {{ billing.storage.includedGb }} GB inclus + {{ billing.storage.extraUnits * billing.storage.unitGb }} GB extra
          </p>
        </UPageCard>
      </div>

      <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div class="space-y-4">
          <UPageCard
            title="Profile seats"
            description="Planul include 5 profile. Profilele extra se factureaza lunar, iar scaderile se aplica la finalul perioadei platite."
            variant="subtle"
          >
            <div class="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center">
              <UInput
                v-model.number="profileSeatsDraft"
                type="number"
                min="5"
                :disabled="saving"
              />
              <div class="text-sm text-muted">
                <p>{{ billing.profileSeats.included }} incluse, {{ Math.max(0, profileSeatsDraft - billing.profileSeats.included) }} extra.</p>
                <p v-if="!canDecreaseSeats" class="mt-1 text-error">
                  Limita nu poate fi sub profilele active curente.
                </p>
              </div>
            </div>
          </UPageCard>

          <UPageCard
            title="Storage tenant-wide"
            :description="`1 unitate = ${storageUnitGb} GB. Pret: ${storagePrice.toFixed(2)} EUR / unitate / luna.`"
            variant="subtle"
          >
            <div class="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center">
              <UInput
                v-model.number="storageUnitsDraft"
                type="number"
                min="0"
                :disabled="saving"
              />
              <div class="text-sm text-muted">
                <p>Total: {{ billing.storage.includedGb + storageUnitsDraft * storageUnitGb }} GB.</p>
                <p>Cost extra storage: {{ extraStorageCost.toFixed(2) }} EUR/luna.</p>
              </div>
            </div>
          </UPageCard>

          <UPageCard
            title="Rapoarte si dashboard-uri"
            description="Activeaza configurarea rapoartelor si dashboard-urilor in UI pentru intreg tenantul."
            variant="subtle"
          >
            <USwitch
              v-model="reportsDashboardsDraft"
              :disabled="saving"
              label="Activ"
            />
          </UPageCard>
        </div>

        <aside class="space-y-4">
          <UPageCard
            title="Aplicare modificari"
            description="Cresterile se aplica imediat cu proration. Scaderile sunt programate la finalul perioadei platite."
            variant="subtle"
          >
            <div class="space-y-3">
              <UButton
                block
                icon="i-lucide-save"
                :loading="saving"
                :disabled="saving || !canDecreaseSeats"
                @click="saveBilling"
              >
                Salveaza modificarile
              </UButton>
              <p class="text-xs leading-5 text-muted">
                Cresterile sunt pregatite pentru Stripe proration, iar scaderile se programeaza la finalul perioadei.
              </p>
            </div>
          </UPageCard>

          <UPageCard
            v-if="billing.scheduledChanges.length"
            title="Schimbari programate"
            variant="subtle"
          >
            <ul class="space-y-3 text-sm">
              <li
                v-for="change in billing.scheduledChanges"
                :key="change.id"
                class="rounded-md border border-default p-3"
              >
                <p class="font-medium text-highlighted">
                  {{ change.change_type }}
                </p>
                <p class="mt-1 text-muted">
                  Se aplica la {{ new Date(change.effective_at).toLocaleDateString('ro-RO') }}.
                </p>
              </li>
            </ul>
          </UPageCard>
        </aside>
      </div>
    </template>
  </div>
</template>
