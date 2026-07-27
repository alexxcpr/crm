<script setup lang="ts">
import type { Field } from '~/types/schema'
import type { FilterCondition, FilterOperatorOption } from '~/types/filters'
import { createFilterCondition, getActiveFilterConditions, getFilterOperators } from '~/utils/filterOperators'
import DynamicFilterDateInput from './FilterDateInput.vue'

const props = defineProps<{
  field: Field
  modelValue: FilterCondition[]
}>()

const emit = defineEmits<{
  'update:modelValue': [conditions: FilterCondition[]]
}>()

type OperatorSelectItem = FilterOperatorOption & {
  key: string
}

const open = ref(false)
const localConditions = ref<FilterCondition[]>([])
const relationSearch = ref('')

const {
  getRelationOptions,
  isRelationOptionsLoading,
  shouldRefreshRelationOptions,
  refreshRelationOptions
} = useRelationOptionsCache()

const operatorItems = computed<OperatorSelectItem[]>(() =>
  getFilterOperators(props.field).map((operator, index) => ({
    ...operator,
    key: `${operator.value}:${String(operator.defaultValue ?? '')}:${index}`
  }))
)

const hasActiveFilter = computed(() => getActiveFilterConditions(props.modelValue, props.field).length > 0)
const relationItems = computed(() => getRelationOptions(props.field, relationSearch.value))
const relationLoading = computed(() => isRelationOptionsLoading(props.field, relationSearch.value))

watch(open, (isOpen) => {
  if (!isOpen) return
  localConditions.value = cloneConditions(props.modelValue.length ? props.modelValue : [createFilterCondition(props.field)])
  refreshRelationOptionsIfNeeded()
})

watch(() => props.modelValue, (conditions) => {
  if (!open.value) {
    localConditions.value = cloneConditions(conditions)
  }
}, { deep: true })

let searchDebounce: ReturnType<typeof setTimeout> | undefined
watch(relationSearch, () => {
  if (!open.value || props.field.ui_type !== 'relation') return
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(refreshRelationOptionsIfNeeded, 250)
})

onUnmounted(() => {
  if (searchDebounce) clearTimeout(searchDebounce)
})

function cloneConditions(conditions: FilterCondition[]): FilterCondition[] {
  return conditions.map(condition => ({
    ...condition,
    value: Array.isArray(condition.value) ? [...condition.value] : condition.value
  }))
}

function refreshRelationOptionsIfNeeded() {
  if (props.field.ui_type !== 'relation') return
  if (shouldRefreshRelationOptions(props.field, relationSearch.value)) {
    refreshRelationOptions(props.field, {
      search: relationSearch.value,
      background: relationItems.value.length > 0
    }).catch((err) => {
      console.error('[ColumnFilter] Eroare la incarcarea relatiilor:', err)
    })
  }
}

function getSelectedOperatorKey(condition: FilterCondition): string {
  const match = operatorItems.value.find(item =>
    item.value === condition.operator
    && (item.defaultValue === undefined || item.defaultValue === condition.value)
  )
  return match?.key ?? operatorItems.value[0]?.key ?? ''
}

function getOperator(condition: FilterCondition): OperatorSelectItem | undefined {
  return operatorItems.value.find(item => item.key === getSelectedOperatorKey(condition))
}

function onOperatorChange(condition: FilterCondition, key: string) {
  const operator = operatorItems.value.find(item => item.key === key)
  if (!operator) return

  condition.operator = operator.value
  condition.value = operator.defaultValue ?? getEmptyValue(operator)
}

function getEmptyValue(operator: FilterOperatorOption): unknown {
  if (operator.valueKind === 'relation-multiple') return []
  if (operator.valueKind === 'range') return ['', '']
  return null
}

function addCondition() {
  localConditions.value.push(createFilterCondition(props.field))
}

function removeCondition(index: number) {
  localConditions.value.splice(index, 1)
  if (localConditions.value.length === 0) {
    localConditions.value.push(createFilterCondition(props.field))
  }
}

function applyFilters() {
  emit('update:modelValue', cloneConditions(localConditions.value))
  open.value = false
}

function resetFilters() {
  localConditions.value = [createFilterCondition(props.field)]
  emit('update:modelValue', [])
  open.value = false
}

function updateRange(condition: FilterCondition, index: number, value: string | number) {
  const range = Array.isArray(condition.value) ? [...condition.value] : ['', '']
  range[index] = value
  condition.value = range
}

function updateValue(condition: FilterCondition, value: string | number | null | undefined) {
  condition.value = value ?? ''
}

function getScalarValue(condition: FilterCondition): string | number | undefined {
  if (typeof condition.value === 'string' || typeof condition.value === 'number') return condition.value
  return undefined
}

function getRangeValue(condition: FilterCondition, index: number): string | number {
  return Array.isArray(condition.value) ? (condition.value[index] as string | number) ?? '' : ''
}

function getRelationValue(condition: FilterCondition): string | undefined {
  return typeof condition.value === 'string' ? condition.value : undefined
}

function updateRelationValue(condition: FilterCondition, value: string | string[] | undefined) {
  condition.value = Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function getRelationValues(condition: FilterCondition): string[] {
  return Array.isArray(condition.value) ? condition.value.map(String) : []
}

function updateRelationValues(condition: FilterCondition, value: string | string[] | undefined) {
  condition.value = Array.isArray(value) ? value : value ? [value] : []
}

function dateInputMode(): 'date' | 'datetime' {
  return props.field.ui_type === 'datetimepicker' ? 'datetime' : 'date'
}

function isDateRange(operator?: FilterOperatorOption): boolean {
  return operator?.valueKind === 'range' && props.field.data_type === 'datetime'
}

function onRelationSearch(query: string) {
  relationSearch.value = query
}
</script>

<template>
  <UPopover
    v-model:open="open"
    :content="{ align: 'start' }"
    :ui="{ content: 'w-80 max-w-[calc(100vw-24px)]' }"
  >
    <UButton
      icon="i-lucide-filter"
      color="neutral"
      variant="ghost"
      size="xs"
      :aria-label="`Filtreaza ${field.name}`"
      :class="[
        'shrink-0 rounded-full',
        hasActiveFilter ? 'bg-primary/30 text-primary hover:bg-primary/35 [&_svg]:size-4 [&_svg]:fill-current [&_svg]:stroke-primary [&_svg]:stroke-3' : ''
      ]"
      @click.stop
    />

    <template #content>
      <div class="space-y-3 p-3">
        <div class="flex items-center justify-between gap-2">
          <div>
            <p class="text-sm font-semibold text-highlighted">
              Filtreaza {{ field.name }}
            </p>
            <p class="text-xs text-muted">
              Conditiile de aici se combina cu OR.
            </p>
          </div>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="open = false"
          />
        </div>

        <div class="space-y-2">
          <div
            v-for="(condition, index) in localConditions"
            :key="condition.id"
            class="rounded-xl border border-default bg-elevated/30 p-2"
          >
            <div class="flex items-center gap-1.5">
              <USelect
                :model-value="getSelectedOperatorKey(condition)"
                :items="operatorItems"
                value-key="key"
                size="sm"
                class="min-w-0 flex-1"
                @update:model-value="(key: string) => onOperatorChange(condition, key)"
              />
              <UButton
                icon="i-lucide-trash-2"
                color="neutral"
                variant="ghost"
                size="xs"
                :disabled="localConditions.length === 1"
                @click="removeCondition(index)"
              />
            </div>

            <div v-if="getOperator(condition)?.valueKind === 'text'" class="mt-2">
              <UInput
                :model-value="getScalarValue(condition)"
                size="sm"
                placeholder="Valoare"
                class="w-full"
                @update:model-value="(value: string | number) => updateValue(condition, value)"
              />
            </div>

            <div v-else-if="getOperator(condition)?.valueKind === 'number'" class="mt-2">
              <UInput
                :model-value="getScalarValue(condition)"
                type="number"
                size="sm"
                placeholder="Valoare"
                class="w-full"
                @update:model-value="(value: string | number) => updateValue(condition, value)"
              />
            </div>

            <div v-else-if="['date', 'datetime'].includes(getOperator(condition)?.valueKind ?? '')" class="mt-2">
              <DynamicFilterDateInput
                :model-value="getScalarValue(condition)"
                :mode="dateInputMode()"
                @update:model-value="(value: string) => updateValue(condition, value)"
              />
            </div>

            <div v-else-if="isDateRange(getOperator(condition))" class="mt-2 grid gap-2">
              <DynamicFilterDateInput
                :model-value="getRangeValue(condition, 0)"
                placeholder="De la"
                :mode="dateInputMode()"
                @update:model-value="(value: string) => updateRange(condition, 0, value)"
              />
              <DynamicFilterDateInput
                :model-value="getRangeValue(condition, 1)"
                placeholder="Până la"
                :mode="dateInputMode()"
                @update:model-value="(value: string) => updateRange(condition, 1, value)"
              />
            </div>

            <div v-else-if="getOperator(condition)?.valueKind === 'range'" class="mt-2 grid grid-cols-2 gap-2">
              <UInput
                :model-value="getRangeValue(condition, 0)"
                type="number"
                size="sm"
                placeholder="De la"
                @update:model-value="(value: string | number) => updateRange(condition, 0, value)"
              />
              <UInput
                :model-value="getRangeValue(condition, 1)"
                type="number"
                size="sm"
                placeholder="Pana la"
                @update:model-value="(value: string | number) => updateRange(condition, 1, value)"
              />
            </div>

            <div v-else-if="getOperator(condition)?.valueKind === 'relation'" class="mt-2">
              <USelectMenu
                :model-value="getRelationValue(condition)"
                :items="relationItems"
                value-key="value"
                :loading="relationLoading"
                :search-input="{ placeholder: 'Cauta...' }"
                placeholder="Selecteaza"
                size="sm"
                class="w-full"
                @update:model-value="(value: string | string[] | undefined) => updateRelationValue(condition, value)"
                @update:search-term="onRelationSearch"
              />
            </div>

            <div v-else-if="getOperator(condition)?.valueKind === 'relation-multiple'" class="mt-2">
              <USelectMenu
                :model-value="getRelationValues(condition)"
                :items="relationItems"
                value-key="value"
                multiple
                :loading="relationLoading"
                :search-input="{ placeholder: 'Cauta...' }"
                placeholder="Selecteaza valori"
                size="sm"
                class="w-full"
                @update:model-value="(value: string | string[] | undefined) => updateRelationValues(condition, value)"
                @update:search-term="onRelationSearch"
              />
            </div>
          </div>
        </div>

        <UButton
          label="Adauga conditie"
          icon="i-lucide-plus"
          color="neutral"
          variant="outline"
          size="sm"
          class="w-full justify-center"
          @click="addCondition"
        />

        <div class="flex items-center justify-between gap-2 border-t border-default pt-3">
          <UButton
            label="Reseteaza"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="resetFilters"
          />
          <UButton
            label="Aplica"
            icon="i-lucide-check"
            size="sm"
            @click="applyFilters"
          />
        </div>
      </div>
    </template>
  </UPopover>
</template>
