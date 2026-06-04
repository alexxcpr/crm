<script setup lang="ts">
import type { ConditionOperand } from '~/composables/useNodeTypes'
import type { DataSource } from '~/composables/useWorkflowDataRegistry'
import type { Field } from '~/types/schema'

const props = defineProps<{
  modelValue: ConditionOperand
  dataSources: DataSource[]
  fetchSourceFields?: (nodeId: string) => Promise<Field[]>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ConditionOperand]
}>()

const sourceType = ref<ConditionOperand['sourceType']>(props.modelValue?.sourceType ?? 'static')
const sourceNodeId = ref(props.modelValue?.sourceNodeId ?? '')
const fieldSlug = ref(props.modelValue?.fieldSlug ?? '')
const staticValue = ref(props.modelValue?.value ?? '')
const fieldOptions = ref<Field[]>([])
const fetching = ref(false)
const warning = ref<string | null>(null)

watch(() => props.modelValue, (v) => {
  if (!v) return
  sourceType.value = v.sourceType ?? 'static'
  sourceNodeId.value = v.sourceNodeId ?? ''
  fieldSlug.value = v.fieldSlug ?? ''
  staticValue.value = v.value ?? ''
})

function emitUpdate() {
  const operand: ConditionOperand = {
    sourceType: sourceType.value,
    value: sourceType.value === 'static' ? staticValue.value : undefined,
    sourceNodeId: sourceType.value === 'node_output' ? sourceNodeId.value || undefined : undefined,
    fieldSlug: sourceType.value === 'node_output' ? fieldSlug.value || undefined : undefined,
  }

  // Attach field metadata for display and type-aware operator filtering
  if (sourceType.value === 'node_output' && fieldSlug.value) {
    const field = fieldOptions.value.find(f => f.column_name === fieldSlug.value)
    if (field) {
      operand.fieldLabel = `${field.name} (${field.column_name})`
      operand.dataType = field.data_type
    }
  }

  emit('update:modelValue', operand)
}

// ─── Source node changed → fetch fields ───

async function onSourceNodeChange(nodeId: string) {
  sourceNodeId.value = nodeId
  fieldSlug.value = ''
  fieldOptions.value = []
  warning.value = null
  emitUpdate()
  if (!nodeId || !props.fetchSourceFields) return

  fetching.value = true
  try {
    fieldOptions.value = await props.fetchSourceFields(nodeId)
  } finally {
    fetching.value = false
  }
}

// ─── Field changed ───

function onFieldChange(columnName: string) {
  fieldSlug.value = columnName
  emitUpdate()
}

// ─── Static value changed ───

function onStaticChange(value: string) {
  staticValue.value = value
  emitUpdate()
}

// ─── Type badge ───

const typeLabel = computed(() => {
  if (sourceType.value === 'static') return null
  if (!fieldSlug.value) return null
  const field = fieldOptions.value.find(f => f.column_name === fieldSlug.value)
  if (!field) return null
  const map: Record<string, string> = {
    varchar: 'text', text: 'text', uuid: 'text',
    integer: 'număr', numeric: 'număr',
    boolean: 'boolean',
    date: 'dată', timestamp: 'dată',
    jsonb: 'json',
  }
  return map[field.data_type] ?? field.data_type
})

const typeBadgeColor = computed(() => {
  if (!typeLabel.value) return ''
  switch (typeLabel.value) {
    case 'număr': return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
    case 'dată': return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
    case 'boolean': return 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
    default: return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
  }
})

// ─── Source type options ───

const sourceTypeOptions = [
  { label: 'Valoare fixă', value: 'static' },
  { label: 'Din nod', value: 'node_output' },
]

const dataSourceOptions = computed(() =>
  props.dataSources.map(ds => ({
    label: `${ds.label} (${ds.entitySlug})`,
    value: ds.nodeId,
  })),
)

const fieldSelectOptions = computed(() =>
  fieldOptions.value.map(f => ({
    label: `${f.name} (${f.column_name})`,
    value: f.column_name,
  })),
)
</script>

<template>
  <div class="space-y-1.5">
    <!-- Source type tabs -->
    <div class="flex items-center gap-0.5">
      <UButton
        v-for="opt in sourceTypeOptions"
        :key="opt.value"
        :label="opt.label"
        :variant="sourceType === opt.value ? 'solid' : 'ghost'"
        :color="sourceType === opt.value ? 'neutral' : 'neutral'"
        size="xs"
        @click="sourceType = opt.value as ConditionOperand['sourceType']; emitUpdate()"
      />
    </div>

    <!-- Static value input -->
    <UInput
      v-if="sourceType === 'static'"
      :model-value="staticValue"
      size="xs"
      class="w-full"
      placeholder="Scrie valoarea..."
      @update:model-value="onStaticChange"
    />

    <!-- node_output: cascading selects -->
    <template v-else>
      <USelect
        :model-value="sourceNodeId"
        :items="dataSourceOptions"
        value-key="value"
        label-key="label"
        size="xs"
        class="w-full"
        placeholder="Sursa datelor..."
        @update:model-value="onSourceNodeChange"
      />
      <USelect
        :model-value="fieldSlug"
        :items="fieldSelectOptions"
        value-key="value"
        label-key="label"
        size="xs"
        class="w-full"
        placeholder="Alege câmpul..."
        :loading="fetching"
        @update:model-value="onFieldChange"
      />

      <!-- Type badge -->
      <span
        v-if="typeLabel"
        class="inline-block text-[10px] px-1.5 py-0.5 rounded font-medium"
        :class="typeBadgeColor"
      >
        {{ typeLabel }}
      </span>

      <!-- Warnings -->
      <p
        v-if="warning"
        class="text-[10px] text-amber-600 dark:text-amber-400"
      >
        {{ warning }}
      </p>
    </template>
  </div>
</template>
