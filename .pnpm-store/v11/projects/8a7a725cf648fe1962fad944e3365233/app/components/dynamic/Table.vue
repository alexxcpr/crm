<script setup lang="ts">
import type { Field } from '~/types/schema'
import type { ColumnFilters, FilterCondition } from '~/types/filters'
import { buildApiFilters, countActiveFilterConditions } from '~/utils/filterOperators'
import { parseDashboardRouteFilters } from '~/utils/dashboardDrilldown'

const props = defineProps<{
  entity: string
}>()

const emit = defineEmits<{
  add: []
  edit: [id: string]
}>()

const route = useRoute()
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

const currentPage = ref(1)
const pageSize = ref(25)
const currentSort = ref('-date_created')
const filters = ref<ColumnFilters>(
  parseDashboardRouteFilters(route.query as Record<string, unknown>)
)

const filterableFields = computed(() => {
  const byColumn = new Map<string, Field>()
  for (const field of tableFields.value) byColumn.set(field.column_name, field)
  for (const field of filterFields.value) byColumn.set(field.column_name, field)
  return Array.from(byColumn.values())
})

const apiFilters = computed(() =>
  buildApiFilters(filters.value, filterableFields.value)
)

const activeFilterCount = computed(() =>
  countActiveFilterConditions(filters.value, filterableFields.value)
)

const error = computed(() => schemaError.value || dataError.value)

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
  ([loadedSchema]) => {
    if (loadedSchema) loadData()
  },
  { deep: true, immediate: true }
)

function updateSort(sort: string) {
  currentSort.value = sort
  currentPage.value = 1
}

function updateColumnFilter(columnName: string, conditions: FilterCondition[]) {
  filters.value = {
    ...filters.value,
    [columnName]: conditions
  }
  currentPage.value = 1
}

function updateFilters(next: ColumnFilters) {
  filters.value = next
  currentPage.value = 1
}

function clearFilters() {
  filters.value = {}
  currentPage.value = 1
}

const pageRangeStart = computed(() =>
  meta.value.total === 0 ? 0 : (currentPage.value - 1) * pageSize.value + 1
)

const pageRangeEnd = computed(() =>
  Math.min(currentPage.value * pageSize.value, meta.value.total)
)

const emptyStateTitle = computed(() =>
  activeFilterCount.value ? 'Nu am gasit rezultate' : 'Inca nu exista inregistrari'
)

const emptyStateDescription = computed(() => {
  const label = (entityMeta.value?.label_plural ?? 'inregistrari').toLowerCase()
  if (activeFilterCount.value) {
    return `Filtrele active nu returneaza ${label}. Ajusteaza cautarea sau reseteaza filtrele.`
  }
  return `Creeaza prima inregistrare pentru ${label} si lista va incepe sa se populeze automat.`
})
</script>

<template>
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

  <div v-else-if="error && !items.length" class="p-3 sm:p-6">
    <div class="rounded-2xl border border-error/20 bg-error/5 py-12 shadow-sm">
      <UEmpty icon="i-lucide-alert-triangle" title="Eroare" :description="error">
        <template #actions>
          <UButton
            type="button"
            label="Reincearca"
            icon="i-lucide-refresh-cw"
            variant="outline"
            @click="loadData"
          />
        </template>
      </UEmpty>
    </div>
  </div>

  <div v-else class="flex min-h-0 flex-1 flex-col p-3">
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-default bg-white shadow-sm dark:bg-gray-900">
      <div class="border-b border-default bg-linear-to-r from-primary/10 via-primary/5 to-transparent p-3">
        <div class="rounded-xl border border-primary/15 bg-white/85 p-2 shadow-sm backdrop-blur dark:bg-gray-900/85">
          <div class="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <DynamicFilters
              :model-value="filters"
              :fields="filterFields"
              @update:model-value="updateFilters"
            />
            <div class="flex flex-wrap items-center gap-2">
              <UBadge color="primary" variant="soft">
                {{ meta.total }} total
              </UBadge>
              <UBadge v-if="activeFilterCount" color="warning" variant="soft">
                {{ activeFilterCount }} filtre
              </UBadge>
              <UButton
                v-if="activeFilterCount"
                type="button"
                label="Reseteaza filtre"
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="sm"
                @click="clearFilters"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="flex min-h-0 flex-1 flex-col bg-elevated/30 p-3">
        <DynamicRecordRenderer
          v-if="dataLoading || items.length"
          :entity="entity"
          :records="items"
          :fields="tableFields"
          :loading="dataLoading"
          :can-update="!!capabilities.update"
          :can-delete="!!capabilities.delete"
          :filters="filters"
          :sort="currentSort"
          :delete-record="remove"
          :entity-label="entityMeta?.label_singular ?? entityMeta?.name ?? 'Inregistrare'"
          @edit="emit('edit', $event)"
          @reload="loadData"
          @update:sort="updateSort"
          @update-filter="updateColumnFilter"
        />

        <div
          v-if="!dataLoading && items.length === 0"
          class="grid min-h-[46vh] place-items-center p-6"
        >
          <div class="w-full max-w-xl rounded-3xl border border-dashed border-primary/30 bg-white/90 p-8 text-center shadow-sm dark:bg-gray-900/90">
            <div class="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <UIcon :name="activeFilterCount ? 'i-lucide-search-x' : 'i-lucide-sparkles'" class="size-6" />
            </div>
            <h3 class="mt-4 text-base font-semibold text-highlighted">
              {{ emptyStateTitle }}
            </h3>
            <p class="mx-auto mt-2 max-w-md text-sm text-muted">
              {{ emptyStateDescription }}
            </p>
            <div class="mt-5 flex justify-center gap-2">
              <UButton
                v-if="activeFilterCount"
                type="button"
                label="Reseteaza filtre"
                variant="outline"
                @click="clearFilters"
              />
              <UButton
                v-else-if="capabilities.create"
                type="button"
                :label="`Adauga ${entityMeta?.label_singular ?? 'inregistrare'}`"
                icon="i-lucide-plus"
                @click="emit('add')"
              />
            </div>
          </div>
        </div>

        <div class="mt-auto flex flex-col gap-2 border-t border-default pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-xs text-muted">
            <template v-if="meta.total">
              {{ pageRangeStart }}-{{ pageRangeEnd }} din {{ meta.total }}
            </template>
            <template v-else>
              0 inregistrari
            </template>
          </p>
          <UPagination
            v-if="meta.totalPages > 1"
            :page="currentPage"
            :items-per-page="pageSize"
            :total="meta.total"
            size="sm"
            @update:page="currentPage = $event"
          />
        </div>
      </div>
    </div>
  </div>
</template>
