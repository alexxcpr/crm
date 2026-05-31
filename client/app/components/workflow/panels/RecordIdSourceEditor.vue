<script setup lang="ts">
import type { RecordIdSource } from '~/composables/useNodeTypes'
import type { DataSource } from '~/composables/useWorkflowDataRegistry'
import type { Field } from '~/types/schema'

const props = defineProps<{
  modelValue: RecordIdSource | null
  dataSources?: DataSource[]
  fetchSourceFields?: (nodeId: string) => Promise<Field[]>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: RecordIdSource]
}>()

const sourceType = ref<RecordIdSource['sourceType']>(props.modelValue?.sourceType ?? 'static')
const value = ref(props.modelValue?.value ?? '')
const sourceNodeId = ref(props.modelValue?.sourceNodeId ?? '')
const sourceFieldSlug = ref(props.modelValue?.sourceFieldSlug ?? '')
const fieldOptions = ref<Field[]>([])

watch(() => props.modelValue, (v) => {
  sourceType.value = v?.sourceType ?? 'static'
  value.value = v?.value ?? ''
  sourceNodeId.value = v?.sourceNodeId ?? ''
  sourceFieldSlug.value = v?.sourceFieldSlug ?? ''
})

function emitUpdate() {
  emit('update:modelValue', {
    sourceType: sourceType.value,
    value: value.value,
    sourceNodeId: sourceNodeId.value || undefined,
    sourceFieldSlug: sourceFieldSlug.value || undefined,
  })
}

const sourceOptions = [
  { label: 'Valoare fixa', value: 'static' },
  { label: 'Din inreg. curenta', value: 'current_record' },
  { label: 'Din nodul anterior', value: 'previous_node' },
  { label: 'Din registry (nod)', value: 'node_output' },
]

const payloadFieldOptions = [
  { label: 'ID inregistrare (id)', value: 'id' },
  { label: 'ID inregistrare (recordId)', value: 'recordId' },
  { label: 'Entitate (entity)', value: 'entity' },
  { label: 'ID Entitate (entityId)', value: 'entityId' },
  { label: 'ID Utilizator (userId)', value: 'userId' },
]

const dataSourceOptions = computed(() =>
  (props.dataSources ?? []).map(ds => ({
    label: `${ds.label} (${ds.entitySlug})`,
    value: ds.nodeId,
  })),
)

const fieldSelectOptions = computed(() =>
  fieldOptions.value.map(f => ({
    label: `${f.name} (${f.column_name})`,
    value: f.column_name,
    name: f.name,
  })),
)

async function onSourceNodeChange(nodeId: string) {
  sourceNodeId.value = nodeId
  sourceFieldSlug.value = ''
  fieldOptions.value = []
  emitUpdate()
  if (nodeId && props.fetchSourceFields) {
    fieldOptions.value = await props.fetchSourceFields(nodeId)
  }
}

function onFieldChange(fieldSlug: string) {
  sourceFieldSlug.value = fieldSlug
  const f = fieldOptions.value.find(f => f.column_name === fieldSlug)
  value.value = f?.column_name ?? fieldSlug
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
      @update:model-value="(v: string) => {
        sourceType = v as RecordIdSource['sourceType']
        sourceNodeId = ''
        sourceFieldSlug = ''
        value = ''
        fieldOptions = []
        emitUpdate()
      }"
    />

    <!-- static / previous_node -->
    <UInput
      v-if="sourceType === 'static' || sourceType === 'previous_node'"
      :model-value="value"
      size="sm"
      :placeholder="sourceType === 'static' ? 'Scrie valoarea' : 'ex: id (camp din raspunsul nodului anterior)'"
      @update:model-value="(v: string) => { value = v; emitUpdate() }"
    />

    <!-- current_record -->
    <USelect
      v-else-if="sourceType === 'current_record'"
      :model-value="value"
      :items="payloadFieldOptions"
      value-key="value"
      label-key="label"
      size="sm"
      @update:model-value="(v: string) => { value = v; emitUpdate() }"
    />

    <!-- node_output: cascading selects -->
    <template v-else-if="sourceType === 'node_output'">
      <USelect
        :model-value="sourceNodeId"
        :items="dataSourceOptions"
        value-key="value"
        label-key="label"
        size="sm"
        placeholder="Sursa date..."
        @update:model-value="(v: string) => onSourceNodeChange(v)"
      />
      <USelect
        :model-value="sourceFieldSlug"
        :items="fieldSelectOptions"
        value-key="value"
        label-key="label"
        size="sm"
        placeholder="Campul..."
        @update:model-value="(v: string) => onFieldChange(v)"
      />
    </template>
  </div>
</template>
