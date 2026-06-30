<script setup lang="ts">
import type { FieldMapping, FieldValueSource } from '~/composables/useNodeTypes'
import type { Field } from '~/types/schema'
import type { DataSource } from '~/composables/useWorkflowDataRegistry'

const props = defineProps<{
  modelValue: FieldMapping[]
  dataSources: DataSource[]
  targetEntityFields?: Field[]
  fetchSourceFields?: (nodeId: string) => Promise<Field[]>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: FieldMapping[]]
}>()

// ─── Local state ───
const mappings = ref<FieldMapping[]>([...props.modelValue])

watch(() => props.modelValue, (v) => {
  mappings.value = v ? [...v] : []
})

function emitUpdate() {
  emit('update:modelValue', [...mappings.value])
}

// ─── Row management ───
function addMapping() {
  mappings.value.push({ key: '', sourceType: 'static', value: '' })
  emitUpdate()
}

function removeMapping(index: number) {
  mappings.value.splice(index, 1)
  emitUpdate()
}

function updateKey(index: number, key: string) {
  if (!mappings.value[index]) return
  mappings.value[index].key = key
  emitUpdate()
}

function updateSourceType(index: number, sourceType: FieldValueSource) {
  if (!mappings.value[index]) return
  mappings.value[index].sourceType = sourceType
  mappings.value[index].value = ''
  mappings.value[index].sourceNodeId = undefined
  mappings.value[index].sourceFieldSlug = undefined
  emitUpdate()
}

function updateValue(index: number, value: string) {
  if (!mappings.value[index]) return
  mappings.value[index].value = value
  emitUpdate()
}

function updateSourceNode(index: number, nodeId: string) {
  if (!mappings.value[index]) return
  mappings.value[index].sourceNodeId = nodeId || undefined
  mappings.value[index].sourceFieldSlug = undefined
  emitUpdate()
  if (nodeId && props.fetchSourceFields) {
    props.fetchSourceFields(nodeId)
  }
}

function updateSourceField(index: number, fieldSlug: string) {
  if (!mappings.value[index]) return
  mappings.value[index].sourceFieldSlug = fieldSlug || undefined
  emitUpdate()
}

// ─── Source type options ───
const sourceTypeOptions: { label: string, value: FieldValueSource }[] = [
  { label: 'Valoare fixa', value: 'static' },
  { label: 'Din registry (nod anterior)', value: 'node_output' }
]

// ─── Data source options for the dropdown ───
const dataSourceOptions = computed(() =>
  props.dataSources.map(ds => ({
    label: `${ds.label} (${ds.entitySlug})`,
    value: ds.nodeId
  }))
)

// ─── Get fields for a specific source ───
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

const targetFieldOptions = computed(() =>
  (props.targetEntityFields ?? []).map(f => ({
    label: `${f.name} (${f.column_name})`,
    value: f.column_name
  }))
)
</script>

<template>
  <div class="space-y-3">
    <!-- Rows -->
    <div
      v-for="(mapping, idx) in mappings"
      :key="idx"
      class="border border-gray-200 dark:border-gray-700 rounded-md p-2.5 space-y-2"
    >
      <!-- Field name (destination key) + Remove -->
      <div class="flex items-center gap-1.5">
        <USelect
          v-if="targetFieldOptions.length > 0"
          :model-value="mapping.key"
          :items="targetFieldOptions"
          value-key="value"
          label-key="label"
          size="xs"
          placeholder="Camp destinatie..."
          class="flex-1"
          @update:model-value="(v: string) => updateKey(idx, v)"
        />
        <UInput
          v-else
          :model-value="mapping.key"
          size="xs"
          placeholder="Nume camp in destinatie"
          class="flex-1"
          @update:model-value="(v: string) => updateKey(idx, v)"
        />
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          class="shrink-0"
          @click="removeMapping(idx)"
        />
      </div>

      <!-- Source Type -->
      <USelect
        :model-value="mapping.sourceType"
        :items="sourceTypeOptions"
        value-key="value"
        label-key="label"
        size="xs"
        class="w-full"
        @update:model-value="(v: FieldValueSource) => updateSourceType(idx, v)"
      />

      <!-- Static value -->
      <UInput
        v-if="mapping.sourceType === 'static'"
        :model-value="mapping.value"
        size="xs"
        class="w-full"
        placeholder="ex: Ana, 5, true"
        @update:model-value="(v: string) => updateValue(idx, v)"
      />

      <!-- node_output: pick source + field -->
      <template v-else-if="mapping.sourceType === 'node_output'">
        <USelect
          :model-value="mapping.sourceNodeId ?? ''"
          :items="dataSourceOptions"
          value-key="value"
          label-key="label"
          size="xs"
          class="w-full"
          placeholder="Sursa datelor..."
          @update:model-value="(v: string) => updateSourceNode(idx, v)"
        />
        <USelect
          :model-value="mapping.sourceFieldSlug ?? ''"
          :items="getSourceFieldOptions(mapping.sourceNodeId)"
          value-key="value"
          label-key="label"
          size="xs"
          class="w-full"
          placeholder="Campul din sursa..."
          @update:model-value="(v: string) => updateSourceField(idx, v)"
        />
      </template>

      <!-- Legacy backward compat: current_record -->
      <UInput
        v-else-if="mapping.sourceType === 'current_record'"
        :model-value="mapping.value"
        size="xs"
        class="w-full"
        placeholder="Camp din inreg. curenta (ex: cf_nume)"
        @update:model-value="(v: string) => updateValue(idx, v)"
      />

      <!-- Legacy backward compat: previous_node / expression / relation -->
      <UInput
        v-else
        :model-value="mapping.value"
        size="xs"
        class="w-full"
        placeholder="Valoare"
        @update:model-value="(v: string) => updateValue(idx, v)"
      />
    </div>

    <!-- Empty state -->
    <div
      v-if="mappings.length === 0"
      class="text-xs text-gray-400 text-center py-2"
    >
      Niciun camp mapat. Adauga campuri pentru a popula inregistrarea.
    </div>

    <!-- Add button -->
    <UButton
      label="Adauga camp"
      icon="i-lucide-plus"
      variant="outline"
      color="neutral"
      size="xs"
      block
      @click="addMapping"
    />
  </div>
</template>
