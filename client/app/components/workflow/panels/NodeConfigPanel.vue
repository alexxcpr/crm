<script setup lang="ts">
import type { Node } from '@vue-flow/core'
import type { FieldMapping, FormulaAssignment, RecordIdSource } from '~/composables/useNodeTypes'
import type { DataSource } from '~/composables/useWorkflowDataRegistry'
import type { Field } from '~/types/schema'

const props = defineProps<{
  node: Node | null
  dataSources?: DataSource[]
  fetchEntitySchema?: (slug: string) => Promise<Field[]>
  fetchSourceFields?: (nodeId: string) => Promise<Field[]>
}>()

const emit = defineEmits<{
  updateParameters: [nodeId: string, params: Record<string, any>]
  updateLabel: [nodeId: string, label: string]
  deleteNode: []
  close: []
}>()

const { getNodeType } = useNodeTypes()
const { entities, fetchEntities } = useAdminEntities()

// ─── Target entity fields (for field-mappings in create/update nodes) ───
const targetEntityFields = ref<Field[]>([])

async function fetchTargetEntityFields(entitySlug: string) {
  if (!entitySlug) {
    targetEntityFields.value = []
    return
  }
  if (props.fetchEntitySchema) {
    targetEntityFields.value = await props.fetchEntitySchema(entitySlug)
  }
}

const entityOptions = computed(() =>
  (entities.value || []).map(e => ({ label: e.name, value: e.slug })),
)

// ─── Data source select options (for app_get_related, etc.) ───
const dataSourceOptions = computed(() =>
  (props.dataSources || []).map(ds => ({
    label: `${ds.label} (${ds.entitySlug})`,
    value: ds.nodeId,
  })),
)

// ─── Relation field options (cascading — depends on sourceNodeId) ───
const relationFieldOptions = computed(() => {
  const srcNodeId: string = localParams.value.sourceNodeId ?? ''
  if (!srcNodeId) return []
  const ds = (props.dataSources || []).find(s => s.nodeId === srcNodeId)
  if (!ds) return []
  return ds.fields
    .filter(f => f.ui_type === 'relation' && f.relation_entity_slug)
    .map(f => ({
      label: `${f.name} (${f.slug} → ${f.relation_entity_slug})`,
      value: f.slug,
    }))
})

onMounted(() => {
  fetchEntities()
})

const nodeTypeDef = computed(() => {
  if (!props.node) return null
  return getNodeType(props.node.data.nodeType)
})

const localLabel = ref('')
const localParams = ref<Record<string, any>>({})
const isSwitchingNode = ref(false)

watch(() => props.node, (newNode) => {
  if (newNode) {
    isSwitchingNode.value = true
    localLabel.value = newNode.data.label ?? ''
    localParams.value = { ...(newNode.data.parameters ?? {}) }
    nextTick(() => { isSwitchingNode.value = false })
  }
}, { immediate: true })

function onLabelChange() {
  if (!props.node) return
  emit('updateLabel', props.node.id, localLabel.value)
}

function onParamChange(key: string, value: any) {
  localParams.value[key] = value
  if (!props.node) return
  emit('updateParameters', props.node.id, { ...localParams.value })
}

watch(() => localParams.value.entity, (newEntity, oldEntity) => {
  // Nu sterge fieldMappings cand se schimba nodul — doar cand userul
  // schimba manual dropdown-ul de entitate pe acelasi nod.
  if (isSwitchingNode.value) return
  if (oldEntity && newEntity !== oldEntity) {
    localParams.value.fieldMappings = []
    if (props.node) {
      emit('updateParameters', props.node.id, { ...localParams.value })
    }
  }
})

// Fetch target entity schema for field-mappings autocomplete
watch(() => localParams.value.entity, (entitySlug) => {
  fetchTargetEntityFields(entitySlug ?? '')
  // Also store the entity name for node display
  if (entitySlug) {
    const opt = entityOptions.value.find(e => e.value === entitySlug)
    if (opt && localParams.value.entityName !== opt.label) {
      localParams.value.entityName = opt.label
      if (props.node) {
        emit('updateParameters', props.node.id, { ...localParams.value })
      }
    }
  }
})

watch(() => localParams.value.sourceNodeId, (newVal, oldVal) => {
  // Nu sterge relationField cand se schimba nodul.
  if (!isSwitchingNode.value) {
    if (oldVal && newVal !== oldVal) {
      localParams.value.relationField = ''
      if (props.node) {
        emit('updateParameters', props.node.id, { ...localParams.value })
      }
    }
  }
  // Fetch source entity schema so relation field options are populated
  if (newVal && props.fetchSourceFields) {
    props.fetchSourceFields(newVal)
  }
})
</script>

<template>
  <div
    v-if="node && nodeTypeDef"
    class="w-80 border-l border-gray-200 dark:border-gray-800 overflow-y-auto bg-gray-50 dark:bg-gray-950 flex flex-col"
  >
    <!-- Header -->
    <div class="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-800">
      <div class="flex items-center gap-2 min-w-0">
        <div
          class="w-7 h-7 rounded flex items-center justify-center shrink-0"
          :style="{ backgroundColor: nodeTypeDef.color + '20' }"
        >
          <UIcon :name="nodeTypeDef.icon" class="size-4" :style="{ color: nodeTypeDef.color }" />
        </div>
        <span class="text-sm font-medium truncate text-gray-700 dark:text-gray-200">
          {{ nodeTypeDef.label }}
        </span>
      </div>
      <UButton
        icon="i-lucide-x"
        variant="ghost"
        color="neutral"
        size="xs"
        @click="emit('close')"
      />
    </div>

    <!-- Config Form -->
    <div class="p-3 space-y-4 flex-1">
      <p class="text-xs text-gray-500 dark:text-gray-400">
        {{ nodeTypeDef.description }}
      </p>

      <!-- Node Name -->
      <div>
        <label class="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1 block">Nume nod</label>
        <UInput
          v-model="localLabel"
          size="sm"
          class="w-full"
          placeholder="Nume personalizat"
          @blur="onLabelChange"
        />
      </div>

      <!-- Dynamic Config Fields -->
      <div v-for="field in nodeTypeDef.configFields" :key="field.key">
        <label class="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1 block">
          {{ field.label }}
          <span v-if="field.required" class="text-red-500">*</span>
        </label>

        <UInput
          v-if="field.type === 'text'"
          :model-value="localParams[field.key] ?? ''"
          size="sm"
          class="w-full"
          :placeholder="field.placeholder"
          @update:model-value="onParamChange(field.key, $event)"
        />

        <UTextarea
          v-else-if="field.type === 'textarea'"
          :model-value="localParams[field.key] ?? ''"
          size="sm"
          class="w-full"
          :placeholder="field.placeholder"
          :rows="3"
          @update:model-value="onParamChange(field.key, $event)"
        />

        <USelect
          v-else-if="field.type === 'select'"
          :model-value="localParams[field.key] ?? ''"
          size="sm"
          class="w-full"
          :items="field.options ?? []"
          value-key="value"
          label-key="label"
          @update:model-value="onParamChange(field.key, $event)"
        />

        <USelect
          v-else-if="field.type === 'entity-select'"
          :model-value="localParams[field.key] ?? ''"
          size="sm"
          class="w-full"
          :items="entityOptions"
          value-key="value"
          label-key="label"
          placeholder="Selecteaza entitatea..."
          @update:model-value="onParamChange(field.key, $event)"
        />

        <USelect
          v-else-if="field.type === 'data-source-select'"
          :model-value="localParams[field.key] ?? ''"
          size="sm"
          class="w-full"
          :items="dataSourceOptions"
          value-key="value"
          label-key="label"
          placeholder="Selecteaza sursa de date..."
          @update:model-value="onParamChange(field.key, $event)"
        />

        <USelect
          v-else-if="field.type === 'relation-field-select'"
          :model-value="localParams[field.key] ?? ''"
          size="sm"
          class="w-full"
          :items="relationFieldOptions"
          value-key="value"
          label-key="label"
          placeholder="Selecteaza campul relatie..."
          @update:model-value="onParamChange(field.key, $event)"
        />

        <USelect
          v-else-if="field.type === 'target-field-select'"
          :model-value="localParams[field.key] ?? ''"
          :items="targetEntityFields.map(f => ({ label: `${f.name} (${f.column_name})`, value: f.column_name }))"
          value-key="value"
          label-key="label"
          size="sm"
          class="w-full"
          placeholder="Alege campul..."
          @update:model-value="onParamChange(field.key, $event)"
        />

        <UInput
          v-else-if="field.type === 'number'"
          :model-value="localParams[field.key] ?? 0"
          type="number"
          size="sm"
          class="w-full"
          @update:model-value="onParamChange(field.key, Number($event))"
        />

        <WorkflowPanelsRecordIdSourceEditor
          v-else-if="field.type === 'record-id-source'"
          :model-value="(localParams[field.key] as RecordIdSource | null) ?? null"
          :data-sources="dataSources ?? []"
          :fetch-source-fields="fetchSourceFields"
          @update:model-value="onParamChange(field.key, $event)"
        />

        <WorkflowPanelsFieldMappingEditor
          v-else-if="field.type === 'field-mappings'"
          :model-value="(localParams[field.key] as FieldMapping[]) ?? []"
          :data-sources="dataSources ?? []"
          :target-entity-fields="targetEntityFields"
          :fetch-source-fields="fetchSourceFields"
          @update:model-value="onParamChange(field.key, $event)"
        />

        <WorkflowPanelsSetDataEditor
          v-else-if="field.type === 'formula-assignments'"
          :model-value="(localParams[field.key] as FormulaAssignment[]) ?? []"
          :data-sources="dataSources ?? []"
          :fetch-source-fields="fetchSourceFields"
          @update:model-value="onParamChange(field.key, $event)"
        />
      </div>
    </div>

    <!-- Footer Actions -->
    <div class="p-3 border-t border-gray-200 dark:border-gray-800">
      <UButton
        label="Sterge nod"
        icon="i-lucide-trash-2"
        color="error"
        variant="soft"
        size="sm"
        block
        @click="emit('deleteNode')"
      />
    </div>
  </div>
</template>
