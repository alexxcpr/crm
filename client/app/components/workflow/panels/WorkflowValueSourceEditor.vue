<script setup lang="ts">
import type { WorkflowValueSource } from '~/composables/useNodeTypes'
import type { DataSource } from '~/composables/useWorkflowDataRegistry'
import type { Field } from '~/types/schema'

const props = defineProps<{
  modelValue: WorkflowValueSource | null
  dataSources: DataSource[]
  inputKind?: 'email' | 'text' | 'textarea'
  fetchSourceFields?: (nodeId: string) => Promise<Field[]>
}>()

const emit = defineEmits<{ 'update:modelValue': [value: WorkflowValueSource] }>()
const sourceType = ref<WorkflowValueSource['sourceType']>('static')
const staticValue = ref('')
const sourceNodeId = ref('')
const sourceFieldSlug = ref('')
const fields = ref<Field[]>([])
const loading = ref(false)

const sourceOptions = [
  { label: 'Valoare fixa', value: 'static' },
  { label: 'Din nod anterior', value: 'node_output' }
]
const nodeOptions = computed(() => props.dataSources.map(source => ({
  label: `${source.label} (${source.entitySlug})`,
  value: source.nodeId
})))
const fieldOptions = computed(() => fields.value
  .filter(field => props.inputKind !== 'email' || ['varchar', 'text'].includes(field.data_type))
  .map(field => ({ label: `${field.name} (${field.column_name})`, value: field.column_name })))

watch(() => props.modelValue, async (value) => {
  sourceType.value = value?.sourceType ?? 'static'
  staticValue.value = value?.value ?? ''
  sourceNodeId.value = value?.sourceNodeId ?? ''
  sourceFieldSlug.value = value?.sourceFieldSlug ?? ''
  if (sourceType.value === 'node_output' && sourceNodeId.value && props.fetchSourceFields) {
    fields.value = await props.fetchSourceFields(sourceNodeId.value)
  }
}, { immediate: true })

function emitUpdate() {
  const field = fields.value.find(item => item.column_name === sourceFieldSlug.value)
  const source = props.dataSources.find(item => item.nodeId === sourceNodeId.value)
  emit('update:modelValue', sourceType.value === 'static'
    ? { sourceType: 'static', value: staticValue.value }
    : {
        sourceType: 'node_output',
        sourceNodeId: sourceNodeId.value || undefined,
        sourceFieldSlug: sourceFieldSlug.value || undefined,
        fieldLabel: field?.name,
        sourceLabel: source?.label
      })
}

function changeType(value: string) {
  sourceType.value = value as WorkflowValueSource['sourceType']
  staticValue.value = ''
  sourceNodeId.value = ''
  sourceFieldSlug.value = ''
  fields.value = []
  emitUpdate()
}

async function changeNode(nodeId: string) {
  sourceNodeId.value = nodeId
  sourceFieldSlug.value = ''
  fields.value = []
  emitUpdate()
  if (!nodeId || !props.fetchSourceFields) return
  loading.value = true
  try {
    fields.value = await props.fetchSourceFields(nodeId)
  } finally {
    loading.value = false
  }
}

function changeField(field: string) {
  sourceFieldSlug.value = field
  emitUpdate()
}
</script>

<template>
  <div class="space-y-2">
    <USelect
      :model-value="sourceType"
      :items="sourceOptions"
      value-key="value"
      label-key="label"
      size="sm"
      class="w-full"
      @update:model-value="changeType"
    />
    <UTextarea
      v-if="sourceType === 'static' && inputKind === 'textarea'"
      :model-value="staticValue"
      :rows="5"
      class="w-full"
      placeholder="Scrie continutul emailului..."
      @update:model-value="value => { staticValue = value; emitUpdate() }"
    />
    <UInput
      v-else-if="sourceType === 'static'"
      :model-value="staticValue"
      :type="inputKind === 'email' ? 'email' : 'text'"
      class="w-full"
      :placeholder="inputKind === 'email' ? 'email@exemplu.ro' : 'Scrie valoarea...'"
      @update:model-value="value => { staticValue = value; emitUpdate() }"
    />
    <template v-else>
      <USelect
        :model-value="sourceNodeId"
        :items="nodeOptions"
        value-key="value"
        label-key="label"
        placeholder="Alege nodul sursa..."
        size="sm"
        class="w-full"
        @update:model-value="changeNode"
      />
      <USelect
        :model-value="sourceFieldSlug"
        :items="fieldOptions"
        value-key="value"
        label-key="label"
        placeholder="Alege campul..."
        size="sm"
        class="w-full"
        :loading="loading"
        @update:model-value="changeField"
      />
    </template>
  </div>
</template>
