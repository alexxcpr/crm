<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Field } from '~/types/schema'
import type { ColumnFilters, FilterCondition } from '~/types/filters'
import { buildApiFilters, countActiveFilterConditions, summarizeFilterConditions } from '~/utils/filterOperators'
import { upperFirst } from 'scule'

const props = defineProps<{
  entity: string
}>()

const emit = defineEmits<{
  add: []
  edit: [id: string]
}>()

const toast = useToast()
const table = useTemplateRef('table')
const { getRelationOptionLabel } = useRelationOptionsCache()

const UButton = resolveComponent('UButton')
const UDropdownMenu = resolveComponent('UDropdownMenu')
const UCheckbox = resolveComponent('UCheckbox')
const DynamicCellComp = resolveComponent('DynamicCell')
const DynamicColumnFilterComp = resolveComponent('DynamicColumnFilter')

// ─── Schema & Data ───
const {
  entity: entityMeta,
  tableFields,
  filterFields,
  loading: schemaLoading,
  error: schemaError,
  schema,
  capabilities
} = useEntitySchema(props.entity)

const {
  items,
  meta,
  loading: dataLoading,
  error: dataError,
  fetchItems,
  remove
} = useEntityData(props.entity)

// ─── State ───
const currentPage = ref(1)
const pageSize = ref(25)
const currentSort = ref('-date_created')
const filters = ref<ColumnFilters>({})
const rowSelection = ref<Record<string, boolean>>({})

const error = computed(() => schemaError.value || dataError.value)

const { visibleActions, executeAction } = useEntityActions(computed(() => props.entity))

const filterableFields = computed(() => {
  const byColumn = new Map<string, Field>()
  for (const field of tableFields.value) {
    byColumn.set(field.column_name, field)
  }
  for (const field of filterFields.value) {
    byColumn.set(field.column_name, field)
  }
  return Array.from(byColumn.values())
})

const apiFilters = computed(() =>
  buildApiFilters(filters.value, filterableFields.value)
)

// ─── Data loading (reactiv pe toate dependintele) ───
async function loadData() {
  await fetchItems({
    page: currentPage.value,
    limit: pageSize.value,
    sort: currentSort.value,
    filter: apiFilters.value
  })
}

watch(
  [() => schema.value, currentPage, currentSort, filters],
  ([sch]) => {
    if (sch) loadData()
  },
  { deep: true, immediate: true }
)

// ─── Sortare server-side ───
function handleSort(columnName: string) {
  if (currentSort.value === columnName) {
    currentSort.value = `-${columnName}`
  } else if (currentSort.value === `-${columnName}`) {
    currentSort.value = '-date_created'
  } else {
    currentSort.value = columnName
  }
  currentPage.value = 1
}

function getSortState(columnName: string): 'asc' | 'desc' | false {
  if (currentSort.value === columnName) return 'asc'
  if (currentSort.value === `-${columnName}`) return 'desc'
  return false
}

// ─── Filtre ───
function updateColumnFilter(columnName: string, conditions: FilterCondition[]) {
  filters.value = {
    ...filters.value,
    [columnName]: conditions
  }
  currentPage.value = 1
}

function updateFilters(newFilters: ColumnFilters) {
  filters.value = newFilters
  currentPage.value = 1
}

function clearAllFilters() {
  filters.value = {}
  currentPage.value = 1
}

// ─── Labels pentru column visibility ───
const columnLabels = computed(() => {
  const map = new Map<string, string>()
  for (const field of tableFields.value) {
    map.set(field.column_name, field.name)
  }
  return map
})

// ─── Coloane generate dinamic ───
type TableRow = Record<string, unknown> & { id: string }

const columns = computed<TableColumn<TableRow>[]>(() => {
  const cols: TableColumn<TableRow>[] = []

  // Checkbox column
  if (capabilities.value.delete) cols.push({
    id: 'select',
    meta: { class: { th: 'w-4', td: 'w-4' } },
    header: ({ table }) => h(UCheckbox, {
      'modelValue': table.getIsSomePageRowsSelected()
        ? 'indeterminate'
        : table.getIsAllPageRowsSelected(),
      'onUpdate:modelValue': (value: boolean | 'indeterminate') =>
        table.toggleAllPageRowsSelected(!!value),
      'ariaLabel': 'Selecteaza tot'
    }),
    cell: ({ row }) => h(UCheckbox, {
      'modelValue': row.getIsSelected(),
      'onUpdate:modelValue': (value: boolean | 'indeterminate') =>
        row.toggleSelected(!!value),
      'ariaLabel': 'Selecteaza rand'
    })
  })

  // Quick open button
  cols.push({
    id: 'quick_open',
    meta: { class: { th: 'w-10', td: 'w-10' } },
    cell: ({ row }) => h(UButton, {
      icon: 'i-lucide-pencil',
      label: capabilities.value.update ? 'Edit' : 'Vezi',
      color: 'neutral',
      variant: 'ghost',
      size: 'xs',
      onClick: () => emit('edit', String(row.original.id))
    })
  })

  // Dynamic field columns
  for (const field of tableFields.value) {
    const col: TableColumn<TableRow> = {
      accessorKey: field.column_name,
      cell: ({ row }) => h(DynamicCellComp, {
        value: row.original[field.column_name],
        displayValue: row.original[`${field.column_name}_display`],
        field
      })
    }

    col.header = () => {
      const sortState = getSortState(field.column_name)
      const filterSummary = summarizeFilterConditions(filters.value[field.column_name] ?? [], field, {
        resolveValueLabel: (_field, value) => getRelationOptionLabel(field, value)
      })
      const sortButton = field.is_sortable
        ? h(UButton, {
            color: 'neutral',
            variant: 'ghost',
            label: field.name,
            icon: sortState === 'asc'
              ? 'i-lucide-arrow-up-narrow-wide'
              : sortState === 'desc'
                ? 'i-lucide-arrow-down-wide-narrow'
                : 'i-lucide-arrow-up-down',
            class: '-mx-2.5 min-w-0',
            onClick: () => handleSort(field.column_name)
          })
        : h('span', { class: 'truncate' }, field.name)

      return h('div', { class: 'flex min-w-0 items-center gap-1' }, [
        sortButton,
        h(DynamicColumnFilterComp, {
          'field': field,
          'modelValue': filters.value[field.column_name] ?? [],
          'onUpdate:modelValue': (conditions: FilterCondition[]) => updateColumnFilter(field.column_name, conditions)
        }),
        filterSummary
          ? h('span', {
              title: filterSummary,
              class: 'min-w-0 max-w-32 truncate rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-primary ring-1 ring-primary/20'
            }, filterSummary)
          : null
      ])
    }

    cols.push(col)
  }

  // Actions column
  cols.push({
    id: 'actions',
    cell: ({ row }) => {
      const record = row.original
      return h('div', { class: 'text-right' },
        h(UDropdownMenu, {
          content: { align: 'end' },
          items: [
            { type: 'label', label: 'Actiuni' },
            {
              label: capabilities.value.update ? 'Editeaza' : 'Vezi',
              icon: capabilities.value.update ? 'i-lucide-pencil' : 'i-lucide-eye',
              onSelect: () => emit('edit', record.id)
            },
            {
              label: 'Copiaza ID',
              icon: 'i-lucide-copy',
              onSelect: () => {
                navigator.clipboard.writeText(String(record.id))
                toast.add({ title: 'ID copiat', color: 'success' })
              }
            },
            ...(capabilities.value.update && visibleActions.value.length > 0
              ? [
                  { type: 'separator' as const },
                  ...visibleActions.value.map(action => ({
                    label: action.name,
                    description: action.description,
                    icon: 'i-lucide-zap',
                    onSelect() {
                      executeAction(action.slug, String(record.id))
                    }
                  }))
                ]
              : []),
            ...(capabilities.value.delete
              ? [{ type: 'separator' as const }, {
                  label: 'Sterge',
                  icon: 'i-lucide-trash',
                  color: 'error',
                  onSelect: async () => {
                    const success = await remove(String(record.id))
                    if (success) {
                      toast.add({ title: 'Inregistrare stearsa', color: 'success' })
                      await loadData()
                    } else {
                      toast.add({
                        title: 'Eroare la stergere',
                        description: dataError.value ?? 'Inregistrarea nu a putut fi stearsa.',
                        color: 'error'
                      })
                    }
                  }
                }]
              : [])
          ]
        }, () => h(UButton, {
          icon: 'i-lucide-ellipsis-vertical',
          color: 'neutral',
          variant: 'ghost',
          class: 'ml-auto'
        }))
      )
    }
  })

  return cols
})

const activeFilterCount = computed(() =>
  countActiveFilterConditions(filters.value, filterableFields.value)
)
const selectedIds = computed(() =>
  Object.entries(rowSelection.value)
    .filter(([, selected]) => selected)
    .map(([id]) => id)
)
const selectedCount = computed(() => selectedIds.value.length)

const pageRangeStart = computed(() => {
  if (meta.value.total === 0) return 0
  return (currentPage.value - 1) * pageSize.value + 1
})

const pageRangeEnd = computed(() =>
  Math.min(currentPage.value * pageSize.value, meta.value.total)
)

const emptyStateTitle = computed(() =>
  activeFilterCount.value > 0 ? 'Nu am gasit rezultate' : 'Inca nu exista inregistrari'
)

const emptyStateDescription = computed(() => {
  const label = (entityMeta.value?.label_plural ?? 'inregistrari').toLowerCase()
  if (activeFilterCount.value > 0) {
    return `Filtrele active nu returneaza ${label}. Ajusteaza cautarea sau reseteaza filtrele.`
  }
  return `Creeaza prima inregistrare pentru ${label} si lista va incepe sa se populeze automat.`
})

// ─── Bulk delete ───
const showBulkDeleteConfirm = ref(false)
const bulkDeleting = ref(false)

async function confirmBulkDelete() {
  const ids = selectedIds.value
  if (ids.length === 0) return
  bulkDeleting.value = true
  let deleted = 0
  for (const id of ids) {
    const ok = await remove(id)
    if (ok) deleted++
  }
  bulkDeleting.value = false
  showBulkDeleteConfirm.value = false
  rowSelection.value = {}
  if (deleted === ids.length) {
    toast.add({ title: `${deleted} inregistrari sterse`, color: 'success' })
  } else {
    const failed = ids.length - deleted
    toast.add({
      title: deleted > 0 ? `${deleted} sterse, ${failed} nesterse` : 'Eroare la stergere',
      description: dataError.value ?? 'Unele inregistrari nu au putut fi sterse.',
      color: deleted > 0 ? 'warning' : 'error'
    })
  }
  await loadData()
}
</script>

<template>
  <!-- Schema loading -->
  <div v-if="schemaLoading && !schema" class="space-y-4 p-3 sm:p-6">
    <div class="rounded-2xl border border-primary/15 bg-primary/5 p-4 shadow-sm">
      <div class="flex items-center gap-3">
        <USkeleton class="size-10 rounded-xl" />
        <div class="min-w-0 flex-1 space-y-2">
          <USkeleton class="h-3 w-24" />
          <USkeleton class="h-5 w-48" />
        </div>
        <USkeleton class="h-9 w-28 rounded-full" />
      </div>
    </div>
    <USkeleton class="h-[56vh] w-full rounded-2xl" />
  </div>

  <!-- Error state -->
  <div v-else-if="error && !items.length" class="p-3 sm:p-6">
    <div class="rounded-2xl border border-error/20 bg-error/5 py-12 shadow-sm">
      <UEmpty icon="i-lucide-alert-triangle" title="Eroare" :description="error">
        <template #actions>
          <UButton
            label="Reincearca"
            icon="i-lucide-refresh-cw"
            variant="outline"
            @click="loadData"
          />
        </template>
      </UEmpty>
    </div>
  </div>

  <!-- Main content -->
  <div v-else class="flex min-h-0 flex-1 flex-col p-3 sm:p-3">
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-default bg-white shadow-sm dark:bg-gray-900">
      <!-- Toolbar -->
      <div class="border-b border-default bg-linear-to-r from-primary/10 via-primary/5 to-transparent p-3">
        <div class="rounded-xl border border-primary/15 bg-white/85 p-2 shadow-sm backdrop-blur dark:bg-gray-900/85">
          <div class="flex flex-col gap-2 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <DynamicFilters :model-value="filters" :fields="filterFields" @update:model-value="updateFilters" />

            <div class="flex flex-wrap items-center gap-1.5 2xl:justify-end">
              <UBadge
                color="primary"
                variant="soft"
                size="lg"
                class="px-3 py-1 text-sm font-semibold"
              >
                {{ meta.total }} total
              </UBadge>
              <UBadge
                v-if="activeFilterCount > 0"
                color="warning"
                variant="soft"
                size="lg"
                class="px-3 py-1 text-sm font-semibold"
              >
                {{ activeFilterCount }} filtre
              </UBadge>
              <UButton
                v-if="activeFilterCount > 0"
                label="Reseteaza filtre"
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="sm"
                class="rounded-full"
                @click="clearAllFilters"
              />
              <UBadge
                v-if="selectedCount > 0"
                color="error"
                variant="soft"
                size="lg"
                class="px-3 py-1 text-sm font-semibold"
              >
                {{ selectedCount }} selectate
              </UBadge>

              <UButton
                v-if="capabilities.delete && selectedCount > 0"
                :label="`Sterge (${selectedCount})`"
                color="error"
                variant="subtle"
                icon="i-lucide-trash"
                size="sm"
                class="rounded-full"
                @click="showBulkDeleteConfirm = true"
              />

              <UDropdownMenu
                :items="
                  table?.tableApi
                    ?.getAllColumns()
                    .filter((column: any) => column.getCanHide())
                    .map((column: any) => ({
                      label: columnLabels.get(column.id) ?? upperFirst(column.id),
                      type: 'checkbox' as const,
                      checked: column.getIsVisible(),
                      onUpdateChecked(checked: boolean) {
                        table?.tableApi?.getColumn(column.id)?.toggleVisibility(!!checked)
                      },
                      onSelect(e?: Event) {
                        e?.preventDefault()
                      }
                    }))
                "
                :content="{ align: 'end' }"
              >
                <UButton
                  v-if="capabilities.create"
                  label="Coloane"
                  color="neutral"
                  variant="outline"
                  trailing-icon="i-lucide-settings-2"
                  size="sm"
                  class="rounded-full"
                />
              </UDropdownMenu>
            </div>
          </div>
        </div>
      </div>

      <!-- Table + Footer -->
      <div class="flex min-h-0 flex-1 flex-col bg-elevated/30">
        <div class="relative min-h-0 flex-1 overflow-auto table-scroll">
          <UTable
            ref="table"
            v-model:row-selection="rowSelection"
            :data="items"
            :columns="columns"
            :get-row-id="(row: any) => row.id"
            :loading="dataLoading"
            size="sm"
            :ui="{
              root: 'relative min-w-full overflow-visible!',
              base: 'table-fixed border-separate border-spacing-0',
              thead: 'sticky top-0 z-10 [&>tr]:bg-white/95 dark:[&>tr]:bg-gray-900/95 [&>tr]:backdrop-blur [&>tr]:after:content-none',
              tbody: '[&>tr:nth-child(odd)]:bg-white dark:[&>tr:nth-child(odd)]:bg-gray-900 [&>tr:nth-child(even)]:bg-elevated/5 dark:[&>tr:nth-child(even)]:bg-white/1.5 [&>tr]:transition-colors [&>tr:hover]:bg-primary/8! dark:[&>tr:hover]:bg-primary/12! [&>tr]:last:[&>td]:border-b-0',
              tr: 'data-[selected=true]:bg-primary/12! dark:data-[selected=true]:bg-primary/18! data-[selected=true]:shadow-[inset_3px_0_0_var(--ui-primary)]',
              th: 'h-11 border-b border-default px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted first:pl-4 last:pr-4',
              td: 'border-b border-default/70 px-3 py-2.5 text-sm whitespace-normal wrap-break-down max-w-xs align-middle first:pl-4 last:pr-4',
              separator: 'h-0'
            }"
          />

          <!-- Empty state -->
          <div v-if="!dataLoading && items.length === 0" class="grid min-h-[46vh] place-items-center p-6">
            <div class="relative w-full max-w-xl overflow-hidden rounded-3xl border border-dashed border-primary/30 bg-white/90 p-8 text-center shadow-sm dark:bg-gray-900/90">
              <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,var(--ui-primary)_0,transparent_34%)] opacity-[0.08]" />

              <div class="relative mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                <UIcon :name="activeFilterCount > 0 ? 'i-lucide-search-x' : 'i-lucide-sparkles'" class="size-6" />
              </div>

              <div class="relative mt-4 space-y-2">
                <h3 class="text-base font-semibold text-highlighted">
                  {{ emptyStateTitle }}
                </h3>
                <p class="mx-auto max-w-md text-sm text-muted">
                  {{ emptyStateDescription }}
                </p>
              </div>

              <div class="relative mt-5 flex flex-wrap items-center justify-center gap-2">
                <UBadge v-if="activeFilterCount > 0" color="warning" variant="soft">
                  {{ activeFilterCount }} filtre active
                </UBadge>
                <UButton
                  :label="`Adauga ${entityMeta?.label_singular ?? 'inregistrare'}`"
                  icon="i-lucide-plus"
                  class="rounded-full shadow-sm"
                  @click="$emit('add')"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Footer: total + paginare -->
        <div class="shrink-0 border-t border-default bg-white px-3 py-2 dark:bg-gray-900">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex flex-wrap items-center gap-3 text-[13px] text-muted">
              <div class="flex items-center gap-1.5">
                <UIcon name="i-lucide-list-checks" class="size-3.5" />
                <span v-if="meta.total > 0">
                  {{ pageRangeStart }}-{{ pageRangeEnd }} din {{ meta.total }}
                </span>
                <span v-else>0 inregistrari</span>
              </div>
              <div class="flex items-center gap-1.5">
                <UIcon name="i-lucide-columns-3" class="size-3.5" />
                <span>{{ tableFields.length }} coloane</span>
              </div>
            </div>

            <UPagination
              v-if="meta.totalPages > 1"
              size="xs"
              :page="currentPage"
              :items-per-page="pageSize"
              :total="meta.total"
              @update:page="(p: number) => { currentPage = p }"
            />
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Bulk Delete Confirm Modal -->
  <UModal v-model:open="showBulkDeleteConfirm" title="Confirmare stergere">
    <template #body>
      <p>
        Esti sigur ca vrei sa stergi
        <strong>{{ selectedCount }}</strong>
        inregistrari?
      </p>
      <p class="text-sm text-muted mt-1">
        Aceasta actiune este permanenta si nu poate fi anulata.
      </p>
      <div class="flex items-center gap-3 justify-end mt-4">
        <UButton
          label="Anuleaza"
          color="neutral"
          variant="outline"
          @click="showBulkDeleteConfirm = false"
        />
        <UButton
          label="Sterge"
          color="error"
          icon="i-lucide-trash-2"
          :loading="bulkDeleting"
          @click="confirmBulkDelete"
        />
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.table-scroll {
  scrollbar-color: var(--ui-primary) transparent;
  scrollbar-width: thin;
}

.table-scroll::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.table-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.table-scroll::-webkit-scrollbar-thumb {
  background: var(--ui-primary);
  border-radius: 3px;
}

.table-scroll::-webkit-scrollbar-thumb:hover {
  background: color-mix(in oklab, var(--ui-primary) 80%, transparent);
}
</style>
