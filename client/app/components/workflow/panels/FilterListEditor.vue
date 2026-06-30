<script setup lang="ts">
import type { FilterEntry } from '~/composables/useNodeTypes'
import type { Field } from '~/types/schema'
import type { DataSource } from '~/composables/useWorkflowDataRegistry'

const props = defineProps<{
  modelValue: FilterEntry[]
  targetEntityFields: Field[]
  dataSources: DataSource[]
  fetchSourceFields?: (nodeId: string) => Promise<Field[]>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: FilterEntry[]]
}>()

const filters = ref<FilterEntry[]>([...props.modelValue])

watch(() => props.modelValue, (v) => {
  filters.value = v ? [...v] : []
})

function emitUpdate() {
  emit('update:modelValue', [...filters.value])
}

const operatorOptions = [
  { label: 'Egal', value: 'eq' },
  { label: 'Contine', value: 'contains' },
  { label: 'Mai mare', value: 'gt' },
  { label: 'Mai mic', value: 'lt' },
  { label: 'Mai mare sau egal', value: 'gte' },
  { label: 'Mai mic sau egal', value: 'lte' }
]

// ─── Row management ───

function addFilter() {
  filters.value.push({
    field: '',
    operator: 'eq',
    valueSource: { sourceType: 'static', value: '' }
  })
  emitUpdate()
}

function removeFilter(index: number) {
  filters.value.splice(index, 1)
  emitUpdate()
}

function updateField(index: number, field: string) {
  if (!filters.value[index]) return
  filters.value[index].field = field
  emitUpdate()
}

function updateOperator(index: number, operator: string) {
  if (!filters.value[index]) return
  filters.value[index].operator = operator
  emitUpdate()
}

function updateSourceType(index: number, sourceType: 'static' | 'node_output') {
  if (!filters.value[index]) return
  filters.value[index].valueSource.sourceType = sourceType
  filters.value[index].valueSource.value = ''
  filters.value[index].valueSource.sourceNodeId = undefined
  filters.value[index].valueSource.sourceFieldSlug = undefined
  emitUpdate()
}

function updateStaticValue(index: number, value: string) {
  if (!filters.value[index]) return
  filters.value[index].valueSource.value = value
  emitUpdate()
}

function updateSourceNode(index: number, nodeId: string) {
  if (!filters.value[index]) return
  filters.value[index].valueSource.sourceNodeId = nodeId || undefined
  filters.value[index].valueSource.sourceFieldSlug = undefined
  emitUpdate()
  if (nodeId && props.fetchSourceFields) {
    props.fetchSourceFields(nodeId)
  }
}

function updateSourceField(index: number, fieldSlug: string) {
  if (!filters.value[index]) return
  filters.value[index].valueSource.sourceFieldSlug = fieldSlug || undefined
  emitUpdate()
}

// ─── Field options (from target entity) ───

const targetFieldOptions = computed(() =>
  props.targetEntityFields.map(f => ({
    label: `${f.name} (${f.column_name})`,
    value: f.column_name
  }))
)

// ─── Data source options ───

const dataSourceOptions = computed(() =>
  props.dataSources.map(ds => ({
    label: `${ds.label} (${ds.entitySlug})`,
    value: ds.nodeId
  }))
)

function getFieldsForSource(nodeId: string | undefined): Field[] {
  if (!nodeId) return []
  const ds = props.dataSources.find(s => s.nodeId === nodeId)
  return ds?.fields ?? []
}

function getSourceFieldOptions(nodeId: string | undefined) {
  return getFieldsForSource(nodeId).map(f => ({
    label: `${f.name} (${f.column_name})`,
    value: f.column_name
  }))
}
</script>

<template>
  <div class="space-y-3">
    <!-- Rows -->
    <div
      v-for="(filter, idx) in filters"
      :key="idx"
      class="border border-gray-200 dark:border-gray-700 rounded-md p-2.5 space-y-2"
    >
      <!-- Field + Remove -->
      <div class="flex items-center gap-1.5">
        <USelect
          :model-value="filter.field"
          :items="targetFieldOptions"
          value-key="value"
          label-key="label"
          size="xs"
          placeholder="Camp..."
          class="flex-1"
          @update:model-value="(v: string) => updateField(idx, v)"
        />
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          class="shrink-0"
          @click="removeFilter(idx)"
        />
      </div>

      <!-- Operator -->
      <USelect
        :model-value="filter.operator"
        :items="operatorOptions"
        value-key="value"
        label-key="label"
        size="xs"
        class="w-full"
        @update:model-value="(v: string) => updateOperator(idx, v)"
      />

      <!-- Value source type toggle -->
      <div class="flex gap-0.5 bg-gray-100 dark:bg-gray-800 rounded p-0.5">
        <UButton
          :color="filter.valueSource.sourceType === 'static' ? 'primary' : 'neutral'"
          :variant="filter.valueSource.sourceType === 'static' ? 'solid' : 'ghost'"
          size="xs"
          class="flex-1"
          label="Valoare fixa"
          @click="updateSourceType(idx, 'static')"
        />
        <UButton
          :color="filter.valueSource.sourceType === 'node_output' ? 'primary' : 'neutral'"
          :variant="filter.valueSource.sourceType === 'node_output' ? 'solid' : 'ghost'"
          size="xs"
          class="flex-1"
          label="Din nod"
          @click="updateSourceType(idx, 'node_output')"
        />
      </div>

      <!-- Static value -->
      <UInput
        v-if="filter.valueSource.sourceType === 'static'"
        :model-value="filter.valueSource.value"
        size="xs"
        class="w-full"
        placeholder="ex: test, 100, true"
        @update:model-value="(v: string) => updateStaticValue(idx, v)"
      />

      <!-- node_output: pick source + field -->
      <template v-else-if="filter.valueSource.sourceType === 'node_output'">
        <USelect
          :model-value="filter.valueSource.sourceNodeId ?? ''"
          :items="dataSourceOptions"
          value-key="value"
          label-key="label"
          size="xs"
          class="w-full"
          placeholder="Sursa datelor..."
          @update:model-value="(v: string) => updateSourceNode(idx, v)"
        />
        <USelect
          :model-value="filter.valueSource.sourceFieldSlug ?? ''"
          :items="getSourceFieldOptions(filter.valueSource.sourceNodeId)"
          value-key="value"
          label-key="label"
          size="xs"
          class="w-full"
          placeholder="Campul din sursa..."
          @update:model-value="(v: string) => updateSourceField(idx, v)"
        />
      </template>
    </div>

    <!-- Empty state -->
    <div
      v-if="filters.length === 0"
      class="text-xs text-gray-400 text-center py-2"
    >
      Niciun filtru adaugat.
    </div>

    <!-- Add button -->
    <UButton
      label="Adauga filtru"
      icon="i-lucide-plus"
      variant="outline"
      color="neutral"
      size="xs"
      block
      @click="addFilter"
    />
  </div>
</template>
