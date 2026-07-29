<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Field } from '~/types/schema'
import type { ColumnFilters, FilterCondition } from '~/types/filters'
import { summarizeFilterConditions } from '~/utils/filterOperators'
import { upperFirst } from 'scule'

type RecordRow = Record<string, any> & { id?: string }

const props = withDefaults(defineProps<{
  entity: string
  records: RecordRow[]
  fields: Field[]
  loading?: boolean
  mode?: 'table' | 'cards'
  canUpdate?: boolean
  canDelete?: boolean
  filters?: ColumnFilters
  sort?: string
  sortFallback?: string
  cardTitleField?: Field
  cardFields?: Field[]
  entityLabel?: string
  deleteRecord?: (recordId: string) => Promise<boolean>
}>(), {
  loading: false,
  mode: 'table',
  canUpdate: false,
  canDelete: false,
  filters: () => ({}),
  sort: '-date_created',
  sortFallback: '-date_created',
  cardFields: () => [],
  entityLabel: 'Inregistrare',
  deleteRecord: undefined
})

const emit = defineEmits<{
  'edit': [recordId: string]
  'reload': []
  'update:sort': [sort: string]
  'update-filter': [columnName: string, conditions: FilterCondition[]]
}>()

const toast = useToast()
const table = useTemplateRef('table')
const { getRelationOptionLabel } = useRelationOptionsCache()
const { visibleActions, executeAction } = useEntityActions(computed(() => props.entity))

const UButton = resolveComponent('UButton')
const UCheckbox = resolveComponent('UCheckbox')
const UDropdownMenu = resolveComponent('UDropdownMenu')
const DynamicCellComp = resolveComponent('DynamicCell')
const DynamicColumnFilterComp = resolveComponent('DynamicColumnFilter')

const rowSelection = ref<Record<string, boolean>>({})
const bulkDeleting = ref(false)
const showBulkDeleteConfirm = ref(false)

watch(() => props.records, () => {
  rowSelection.value = {}
})

const selectedIds = computed(() =>
  Object.entries(rowSelection.value)
    .filter(([, selected]) => selected)
    .map(([id]) => id)
)

const columnLabels = computed(() =>
  new Map(props.fields.map(field => [field.column_name, field.name]))
)

function getSortState(columnName: string): 'asc' | 'desc' | false {
  if (props.sort === columnName) return 'asc'
  if (props.sort === `-${columnName}`) return 'desc'
  return false
}

function toggleSort(columnName: string) {
  if (props.sort === columnName) emit('update:sort', `-${columnName}`)
  else if (props.sort === `-${columnName}`) emit('update:sort', props.sortFallback)
  else emit('update:sort', columnName)
}

async function removeOne(recordId: string) {
  if (!props.deleteRecord) return
  if (!await props.deleteRecord(recordId)) {
    toast.add({
      title: 'Eroare la stergere',
      description: 'Inregistrarea nu a putut fi stearsa.',
      color: 'error'
    })
    return
  }
  toast.add({ title: 'Inregistrare stearsa', color: 'success' })
  emit('reload')
}

async function confirmBulkDelete() {
  if (!props.deleteRecord || !selectedIds.value.length) return
  const total = selectedIds.value.length
  bulkDeleting.value = true
  let deleted = 0
  for (const id of selectedIds.value) {
    if (await props.deleteRecord(id)) deleted++
  }
  bulkDeleting.value = false
  showBulkDeleteConfirm.value = false
  rowSelection.value = {}
  toast.add({
    title: deleted === total
      ? `${deleted} inregistrari sterse`
      : `${deleted} din ${total} inregistrari sterse`,
    color: deleted === total ? 'success' : deleted > 0 ? 'warning' : 'error'
  })
  emit('reload')
}

async function runAction(actionSlug: string, recordId: string) {
  if (await executeAction(actionSlug, recordId)) emit('reload')
}

function actionItems(record: RecordRow) {
  return [
    { type: 'label' as const, label: 'Actiuni' },
    {
      label: props.canUpdate ? 'Editeaza' : 'Vezi',
      icon: props.canUpdate ? 'i-lucide-pencil' : 'i-lucide-eye',
      onSelect: () => emit('edit', String(record.id))
    },
    {
      label: 'Copiaza ID',
      icon: 'i-lucide-copy',
      onSelect: () => {
        navigator.clipboard.writeText(String(record.id))
        toast.add({ title: 'ID copiat', color: 'success' })
      }
    },
    ...(props.canUpdate && visibleActions.value.length
      ? [
          { type: 'separator' as const },
          ...visibleActions.value.map(action => ({
            label: action.name,
            description: action.description,
            icon: 'i-lucide-zap',
            onSelect: () => runAction(action.slug, String(record.id))
          }))
        ]
      : []),
    ...(props.canDelete
      ? [
          { type: 'separator' as const },
          {
            label: 'Sterge',
            icon: 'i-lucide-trash-2',
            color: 'error' as const,
            onSelect: () => removeOne(String(record.id))
          }
        ]
      : [])
  ]
}

const columns = computed<TableColumn<RecordRow>[]>(() => {
  const result: TableColumn<RecordRow>[] = []

  if (props.canDelete) {
    result.push({
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
  }

  result.push({
    id: 'quick_open',
    meta: { class: { th: 'w-10', td: 'w-10' } },
    cell: ({ row }) => h(UButton, {
      type: 'button',
      icon: props.canUpdate ? 'i-lucide-pencil' : 'i-lucide-eye',
      color: 'neutral',
      variant: 'ghost',
      size: 'xs',
      onClick: () => emit('edit', String(row.original.id))
    })
  })

  for (const field of props.fields) {
    result.push({
      accessorKey: field.column_name,
      cell: ({ row }) => h(DynamicCellComp, {
        value: row.original[field.column_name],
        displayValue: row.original[`${field.column_name}_display`],
        field
      }),
      header: () => {
        const sortState = getSortState(field.column_name)
        const filterSummary = summarizeFilterConditions(
          props.filters[field.column_name] ?? [],
          field,
          {
            resolveValueLabel: (_field, value) => getRelationOptionLabel(field, value)
          }
        )
        return h('div', { class: 'flex min-w-0 items-center gap-1' }, [
          field.is_sortable
            ? h(UButton, {
                type: 'button',
                color: 'neutral',
                variant: 'ghost',
                label: field.name,
                icon: sortState === 'asc'
                  ? 'i-lucide-arrow-up-narrow-wide'
                  : sortState === 'desc'
                    ? 'i-lucide-arrow-down-wide-narrow'
                    : 'i-lucide-arrow-up-down',
                class: '-mx-2.5 min-w-0',
                onClick: () => toggleSort(field.column_name)
              })
            : h('span', { class: 'truncate' }, field.name),
          h(DynamicColumnFilterComp, {
            'field': field,
            'modelValue': props.filters[field.column_name] ?? [],
            'onUpdate:modelValue': (conditions: FilterCondition[]) =>
              emit('update-filter', field.column_name, conditions)
          }),
          filterSummary
            ? h('span', {
                title: filterSummary,
                class: 'max-w-32 truncate rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary'
              }, filterSummary)
            : null
        ])
      }
    })
  }

  result.push({
    id: 'actions',
    cell: ({ row }) => h('div', { class: 'text-right' }, [
      h(UDropdownMenu, {
        content: { align: 'end' },
        items: actionItems(row.original)
      }, () => h(UButton, {
        type: 'button',
        icon: 'i-lucide-ellipsis-vertical',
        color: 'neutral',
        variant: 'ghost'
      }))
    ])
  })

  return result
})

function displayTitle(record: RecordRow): string {
  const field = props.cardTitleField
  if (!field) return props.entityLabel
  return String(
    record[`${field.column_name}_display`]
    ?? record[field.column_name]
    ?? props.entityLabel
  )
}

function toggleCardSelection(recordId: string, selected: boolean | 'indeterminate') {
  rowSelection.value = {
    ...rowSelection.value,
    [recordId]: !!selected
  }
}
</script>

<template>
  <div class="min-w-0 max-w-full space-y-3 overflow-hidden">
    <div
      v-if="selectedIds.length || mode === 'table'"
      class="flex flex-wrap items-center justify-end gap-2"
    >
      <UBadge v-if="selectedIds.length" color="error" variant="soft">
        {{ selectedIds.length }} selectate
      </UBadge>
      <UButton
        v-if="canDelete && selectedIds.length"
        type="button"
        :label="`Sterge (${selectedIds.length})`"
        color="error"
        variant="soft"
        icon="i-lucide-trash-2"
        size="sm"
        @click="showBulkDeleteConfirm = true"
      />
      <UDropdownMenu
        v-if="mode === 'table'"
        :items="table?.tableApi
          ?.getAllColumns()
          .filter((column: any) => column.getCanHide())
          .map((column: any) => ({
            label: columnLabels.get(column.id) ?? upperFirst(column.id),
            type: 'checkbox' as const,
            checked: column.getIsVisible(),
            onUpdateChecked(checked: boolean) {
              table?.tableApi?.getColumn(column.id)?.toggleVisibility(!!checked)
            },
            onSelect(event?: Event) {
              event?.preventDefault()
            }
          }))"
        :content="{ align: 'end' }"
      >
        <UButton
          type="button"
          label="Coloane"
          color="neutral"
          variant="outline"
          trailing-icon="i-lucide-settings-2"
          size="sm"
        />
      </UDropdownMenu>
    </div>

    <div
      v-if="mode === 'table'"
      class="overflow-hidden rounded-2xl border border-default"
    >
      <div class="overflow-x-auto">
        <UTable
          ref="table"
          v-model:row-selection="rowSelection"
          :data="records"
          :columns="columns"
          :get-row-id="(row: RecordRow) => String(row.id)"
          :loading="loading"
          size="sm"
        />
      </div>
    </div>

    <div
      v-else-if="loading"
      class="record-card-grid min-w-0"
    >
      <USkeleton v-for="index in 6" :key="index" class="h-48 rounded-2xl" />
    </div>

    <div
      v-else
      class="record-card-grid min-w-0"
    >
      <article
        v-for="record in records"
        :key="record.id"
        class="group min-w-0 overflow-hidden rounded-2xl border border-default bg-default p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
      >
        <div class="flex items-start gap-3">
          <UCheckbox
            v-if="canDelete"
            :model-value="!!rowSelection[String(record.id)]"
            aria-label="Selecteaza card"
            @update:model-value="toggleCardSelection(String(record.id), $event)"
          />
          <button
            type="button"
            class="min-w-0 flex-1 text-left"
            @click="emit('edit', String(record.id))"
          >
            <h3 class="truncate font-semibold text-highlighted">
              {{ displayTitle(record) }}
            </h3>
            <p class="mt-1 truncate text-xs text-muted">
              {{ entityLabel }}
            </p>
          </button>
          <UDropdownMenu :items="actionItems(record)" :content="{ align: 'end' }">
            <UButton
              type="button"
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
            />
          </UDropdownMenu>
        </div>

        <dl class="mt-4 space-y-2">
          <div
            v-for="field in cardFields"
            :key="field.id_field"
            class="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 text-sm"
          >
            <dt class="truncate text-muted">
              {{ field.name }}
            </dt>
            <dd class="min-w-0 overflow-hidden text-right">
              <DynamicCell
                :field="field"
                :value="record[field.column_name]"
                :display-value="record[`${field.column_name}_display`]"
              />
            </dd>
          </div>
        </dl>
      </article>
    </div>

    <UModal v-model:open="showBulkDeleteConfirm" title="Confirmare stergere">
      <template #body>
        <p>
          Stergi {{ selectedIds.length }} inregistrari?
        </p>
        <p class="mt-1 text-sm text-muted">
          Operatia este permanenta.
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <UButton
            type="button"
            label="Anuleaza"
            color="neutral"
            variant="outline"
            @click="showBulkDeleteConfirm = false"
          />
          <UButton
            type="button"
            label="Sterge"
            color="error"
            icon="i-lucide-trash-2"
            :loading="bulkDeleting"
            @click="confirmBulkDelete"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.record-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr));
  gap: 1rem;
}
</style>
