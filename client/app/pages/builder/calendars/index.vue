<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { CalendarDefinition } from '~/types/calendar'

definePageMeta({ middleware: ['capability'], requiredCapability: 'builder.manage' })

const { features } = useFeatures()
const enabled = computed(() => features.value.calendars === true)
const { calendars, loading, error, fetchCalendars, deleteCalendar } = useAdminCalendars()
const toast = useToast()
const tableRoot = ref<HTMLElement | null>(null)
const { savingRank, persistRankOrder } = useRankReorder()

if (enabled.value) await fetchCalendars()
watch(enabled, (value) => {
  if (value && !calendars.value.length) fetchCalendars()
})

useRankedTableDrag(tableRoot, {
  async onReorder(_group, oldIndex, newIndex) {
    const previous = [...calendars.value]
    calendars.value = normalizeRankOrder(moveRankedItem(calendars.value, oldIndex, newIndex))
    try {
      calendars.value = await persistRankOrder(
        '/v1/admin/calendars/reorder/ranks',
        calendars.value,
        calendar => calendar.id_ui_calendar!
      )
    } catch (err: any) {
      calendars.value = previous
      toast.add({
        title: 'Ordinea calendarelor nu a putut fi salvată',
        description: err?.data?.message || err.message,
        color: 'error'
      })
    }
  }
})

const columns: TableColumn<CalendarDefinition>[] = [
  { id: 'drag', meta: { class: { th: 'w-8', td: 'w-8' } } },
  { accessorKey: 'name', header: 'Denumire' },
  { accessorKey: 'slug', header: 'Slug' },
  { accessorKey: 'active_sources_count', header: 'Surse active' },
  { accessorKey: 'default_view', header: 'Vedere implicită' },
  { accessorKey: 'rank', header: 'Ordine' },
  { accessorKey: 'is_active', header: 'Activ' },
  { id: 'actions', header: '' }
]

async function deactivate(calendar: CalendarDefinition) {
  if (!calendar.id_ui_calendar) return
  const success = await deleteCalendar(calendar.id_ui_calendar)
  toast.add({
    title: success ? 'Calendar dezactivat' : 'Calendarul nu a putut fi dezactivat',
    description: success ? undefined : error.value ?? '',
    color: success ? 'success' : 'error'
  })
}

function actions(calendar: CalendarDefinition) {
  return [[{
    label: 'Editează',
    icon: 'i-lucide-pencil',
    to: `/builder/calendars/${calendar.id_ui_calendar}`
  }, {
    label: 'Deschide',
    icon: 'i-lucide-external-link',
    to: `/calendars/${calendar.slug}`
  }], [{
    label: 'Dezactivează',
    icon: 'i-lucide-eye-off',
    color: 'error' as const,
    disabled: !calendar.is_active,
    onClick: () => deactivate(calendar)
  }]]
}
</script>

<template>
  <UPageCard
    v-if="!enabled"
    icon="i-lucide-lock-keyhole"
    title="Calendarele nu sunt active"
    description="Activează add-on-ul Calendare configurabile pentru a deschide builder-ul."
  >
    <template #footer>
      <UButton label="Vezi abonamentul" to="/admin/billing" icon="i-lucide-credit-card" />
    </template>
  </UPageCard>

  <div v-else>
    <div class="mb-4 flex items-center justify-between gap-4">
      <div>
        <h2 class="text-lg font-semibold">
          Calendare
        </h2>
        <p class="text-sm text-muted">
          Configurează pagini calendar multi-sursă pentru orice entitate.
        </p>
      </div>
      <UButton label="Calendar nou" icon="i-lucide-plus" to="/builder/calendars/new" />
    </div>

    <div ref="tableRoot" data-rank-group="calendars" :data-rank-disabled="savingRank || loading">
      <UTable :data="calendars" :columns="columns" :loading="loading">
        <template #drag-cell>
          <UButton
            class="rank-drag-handle cursor-grab active:cursor-grabbing"
            icon="i-lucide-grip-vertical"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Mută calendarul"
          />
        </template>
        <template #name-cell="{ row }">
          <NuxtLink :to="`/builder/calendars/${row.original.id_ui_calendar}`" class="font-medium text-primary hover:underline">
            {{ row.original.name }}
          </NuxtLink>
        </template>
        <template #slug-cell="{ row }">
          <code class="text-xs">{{ row.original.slug }}</code>
        </template>
        <template #default_view-cell="{ row }">
          <UBadge :label="row.original.default_view" color="neutral" variant="subtle" />
        </template>
        <template #is_active-cell="{ row }">
          <UBadge :label="row.original.is_active ? 'Activ' : 'Inactiv'" :color="row.original.is_active ? 'success' : 'neutral'" variant="subtle" />
        </template>
        <template #actions-cell="{ row }">
          <UDropdownMenu :items="actions(row.original)">
            <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" />
          </UDropdownMenu>
        </template>
      </UTable>
    </div>

    <UEmpty
      v-if="!loading && !calendars.length"
      icon="i-lucide-calendar-days"
      title="Niciun calendar"
      description="Creează prima configurație și apoi leag-o la un element de meniu."
      class="py-12"
    >
      <template #actions>
        <UButton label="Calendar nou" icon="i-lucide-plus" to="/builder/calendars/new" />
      </template>
    </UEmpty>
  </div>
</template>
