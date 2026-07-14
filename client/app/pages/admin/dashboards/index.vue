<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { DashboardDefinition } from '~/types/dashboard'

const { features } = useFeatures()
const enabled = computed(() => features.value.reportsDashboards === true)
const { dashboards, loading, error, fetchDashboards, deleteDashboard } = useAdminDashboards()
const toast = useToast()

if (enabled.value) await fetchDashboards()
watch(enabled, value => { if (value && !dashboards.value.length) fetchDashboards() })

const columns: TableColumn<DashboardDefinition>[] = [
  { accessorKey: 'name', header: 'Denumire' },
  { accessorKey: 'slug', header: 'Slug' },
  { accessorKey: 'widgets_count', header: 'Widget-uri' },
  { accessorKey: 'is_default', header: 'Implicit' },
  { accessorKey: 'is_active', header: 'Activ' },
  { id: 'actions', header: '' }
]

async function deactivate(dashboard: DashboardDefinition) {
  if (!dashboard.id_ui_dashboard) return
  const success = await deleteDashboard(dashboard.id_ui_dashboard)
  toast.add({
    title: success ? 'Dashboard dezactivat' : 'Dashboard-ul nu a putut fi dezactivat',
    description: success ? undefined : error.value ?? '',
    color: success ? 'success' : 'error'
  })
}

function actions(dashboard: DashboardDefinition) {
  return [[{
    label: 'Editeaza',
    icon: 'i-lucide-pencil',
    to: `/admin/dashboards/${dashboard.id_ui_dashboard}`
  }], [{
    label: 'Dezactiveaza',
    icon: 'i-lucide-eye-off',
    color: 'error' as const,
    disabled: dashboard.is_default,
    onClick: () => deactivate(dashboard)
  }]]
}
</script>

<template>
  <UPageCard
    v-if="!enabled"
    icon="i-lucide-lock-keyhole"
    title="Dashboard-urile nu sunt active"
    description="Activeaza add-on-ul Rapoarte si dashboard-uri pentru a deschide builder-ul."
  >
    <template #footer><UButton label="Vezi abonamentul" to="/admin/billing" icon="i-lucide-credit-card" /></template>
  </UPageCard>

  <div v-else>
    <div class="mb-4 flex items-center justify-between gap-4">
      <div>
        <h2 class="text-lg font-semibold">Dashboard-uri</h2>
        <p class="text-sm text-muted">Configureaza pagini cu indicatori si grafice din entitatile tenantului.</p>
      </div>
      <UButton label="Dashboard nou" icon="i-lucide-plus" to="/admin/dashboards/new" />
    </div>

    <UTable :data="dashboards" :columns="columns" :loading="loading">
      <template #name-cell="{ row }">
        <NuxtLink :to="`/admin/dashboards/${row.original.id_ui_dashboard}`" class="font-medium text-primary hover:underline">
          {{ row.original.name }}
        </NuxtLink>
      </template>
      <template #slug-cell="{ row }"><code class="text-xs">{{ row.original.slug }}</code></template>
      <template #is_default-cell="{ row }">
        <UBadge :label="row.original.is_default ? 'Da' : 'Nu'" :color="row.original.is_default ? 'primary' : 'neutral'" variant="subtle" />
      </template>
      <template #is_active-cell="{ row }">
        <UBadge :label="row.original.is_active ? 'Activ' : 'Inactiv'" :color="row.original.is_active ? 'success' : 'neutral'" variant="subtle" />
      </template>
      <template #actions-cell="{ row }">
        <UDropdownMenu :items="actions(row.original)"><UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" /></UDropdownMenu>
      </template>
    </UTable>
  </div>
</template>
