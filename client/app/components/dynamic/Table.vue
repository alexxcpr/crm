<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Field } from '~/types/schema'
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

const UButton = resolveComponent('UButton')
const UDropdownMenu = resolveComponent('UDropdownMenu')
const UCheckbox = resolveComponent('UCheckbox')
const DynamicCellComp = resolveComponent('DynamicCell')

// ─── Schema & Data ───
const {
  entity: entityMeta,
  tableFields,
  filterFields,
  loading: schemaLoading,
  error: schemaError,
  schema
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
const filters = ref<Record<string, any>>({})
const rowSelection = ref({})

const loading = computed(() => schemaLoading.value || dataLoading.value)
const error = computed(() => schemaError.value || dataError.value)

// ─── Data loading (reactiv pe toate dependintele) ───
async function loadData() {
  await fetchItems({
    page: currentPage.value,
    limit: pageSize.value,
    sort: currentSort.value,
    filter: filters.value
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
function handleFilterChange(newFilters: Record<string, any>) {
  filters.value = newFilters
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
const columns = computed<TableColumn<Record<string, any>>[]>(() => {
  const cols: TableColumn<Record<string, any>>[] = []

  // Checkbox column
  cols.push({
    id: 'select',
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
      label: 'Edit',
      color: 'neutral',
      variant: 'ghost',
      size: 'xs',
      onClick: () => emit('edit', row.original.id)
    })
  })

  // Dynamic field columns
  for (const field of tableFields.value) {
    const col: TableColumn<Record<string, any>> = {
      accessorKey: field.column_name,
      cell: ({ row }) => h(DynamicCellComp, {
        value: row.original[field.column_name],
        displayValue: row.original[`${field.column_name}_display`],
        field
      })
    }

    if (field.is_sortable) {
      col.header = () => {
        const sortState = getSortState(field.column_name)
        return h(UButton, {
          color: 'neutral',
          variant: 'ghost',
          label: field.name,
          icon: sortState === 'asc'
            ? 'i-lucide-arrow-up-narrow-wide'
            : sortState === 'desc'
              ? 'i-lucide-arrow-down-wide-narrow'
              : 'i-lucide-arrow-up-down',
          class: '-mx-2.5',
          onClick: () => handleSort(field.column_name)
        })
      }
    } else {
      col.header = field.name
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
              label: 'Editeaza',
              icon: 'i-lucide-pencil',
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
            { type: 'separator' },
            {
              label: 'Sterge',
              icon: 'i-lucide-trash',
              color: 'error',
              onSelect: async () => {
                const success = await remove(record.id)
                if (success) {
                  toast.add({ title: 'Inregistrare stearsa', color: 'success' })
                  await loadData()
                } else {
                  toast.add({ title: 'Eroare la stergere', color: 'error' })
                }
              }
            }
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

const selectedCount = computed(() => Object.keys(rowSelection.value).length)
</script>

<template>
  <!-- Schema loading -->
  <div v-if="schemaLoading && !schema" class="space-y-4">
    <div class="flex gap-2">
      <USkeleton class="h-9 w-64" />
      <USkeleton class="h-9 w-32" />
    </div>
    <USkeleton class="h-96 w-full" />
  </div>

  <!-- Error state -->
  <div v-else-if="error && !items.length" class="py-12">
    <UEmpty icon="i-lucide-alert-triangle" title="Eroare" :description="error">
      <template #actions>
        <UButton label="Reincearca" icon="i-lucide-refresh-cw" @click="loadData" />
      </template>
    </UEmpty>
  </div>

  <!-- Main content -->
  <div v-else>
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center justify-between gap-1.5 mb-4">
      <DynamicFilters :fields="filterFields" @change="handleFilterChange" />

      <div class="flex flex-wrap items-center gap-1.5">
        <UButton
          v-if="selectedCount > 0"
          label="Sterge"
          color="error"
          variant="subtle"
          icon="i-lucide-trash"
        >
          <template #trailing>
            <UKbd>{{ selectedCount }}</UKbd>
          </template>
        </UButton>

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
          <UButton label="Coloane" color="neutral" variant="outline" trailing-icon="i-lucide-settings-2" />
        </UDropdownMenu>

        <UButton
          :label="`Adauga ${entityMeta?.label_singular ?? ''}`"
          icon="i-lucide-plus"
          @click="$emit('add')"
        />
      </div>
    </div>

    <!-- Table -->
    <UTable
      ref="table"
      v-model:row-selection="rowSelection"
      :data="items"
      :columns="columns"
      :loading="dataLoading"
      :ui="{
        base: 'table-fixed border-separate border-spacing-0',
        thead: '[&>tr]:bg-elevated/50 [&>tr]:after:content-none',
        tbody: '[&>tr]:last:[&>td]:border-b-0',
        th: 'py-2 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r',
        td: 'border-b border-default whitespace-normal wrap-break-down max-w-xs',
        separator: 'h-0'
      }"
    />

    <!-- Adauga temporar in template, dupa UTable, ca sa vezi starea -->
    <!-- <pre class="text-xs mt-4 p-2 bg-elevated rounded">
        Schema: {{ !!schema }}
        Items: {{ items.length }}
        Meta: {{ meta }}
        Loading: {{ dataLoading }}
        Error: {{ dataError }}
    </pre> -->

    <!-- Empty state -->
    <div v-if="!dataLoading && items.length === 0" class="py-12">
      <UEmpty
        icon="i-lucide-database"
        title="Nicio inregistrare"
        :description="`Nu exista ${(entityMeta?.label_plural ?? 'inregistrari').toLowerCase()} de afisat.`"
      >
        <template #actions>
          <UButton
            :label="`Adauga ${entityMeta?.label_singular ?? 'inregistrare'}`"
            icon="i-lucide-plus"
            @click="$emit('add')"
          />
        </template>
      </UEmpty>
    </div>

    <!-- Footer: total + paginare -->
    <div v-if="meta.total > 0" class="flex items-center justify-between gap-3 border-t border-default pt-4 mt-auto">
      <div class="text-sm text-muted">
        {{ meta.total }} {{ (entityMeta?.label_plural ?? 'inregistrari').toLowerCase() }}
      </div>

      <UPagination
        v-if="meta.totalPages > 1"
        :page="currentPage"
        :items-per-page="pageSize"
        :total="meta.total"
        @update:page="(p: number) => { currentPage = p }"
      />
    </div>
  </div>
</template>