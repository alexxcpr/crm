<script setup lang="ts">
import type { Node } from '@vue-flow/core'

const props = defineProps<{
  node: Node | null
}>()

const emit = defineEmits<{
  updateParameters: [nodeId: string, params: Record<string, any>]
  updateLabel: [nodeId: string, label: string]
  deleteNode: []
  close: []
}>()

const { getNodeType } = useNodeTypes()

const nodeTypeDef = computed(() => {
  if (!props.node) return null
  return getNodeType(props.node.data.nodeType)
})

const localLabel = ref('')
const localParams = ref<Record<string, any>>({})

watch(() => props.node, (newNode) => {
  if (newNode) {
    localLabel.value = newNode.data.label ?? ''
    localParams.value = { ...(newNode.data.parameters ?? {}) }
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
</script>

<template>
  <div
    v-if="node && nodeTypeDef"
    class="w-72 border-l border-gray-200 dark:border-gray-800 overflow-y-auto bg-gray-50 dark:bg-gray-950 flex flex-col"
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
          :placeholder="field.placeholder"
          @update:model-value="onParamChange(field.key, $event)"
        />

        <UTextarea
          v-else-if="field.type === 'textarea'"
          :model-value="localParams[field.key] ?? ''"
          size="sm"
          :placeholder="field.placeholder"
          :rows="3"
          @update:model-value="onParamChange(field.key, $event)"
        />

        <USelect
          v-else-if="field.type === 'select'"
          :model-value="localParams[field.key] ?? ''"
          size="sm"
          :items="field.options ?? []"
          value-key="value"
          label-key="label"
          @update:model-value="onParamChange(field.key, $event)"
        />

        <UInput
          v-else-if="field.type === 'number'"
          :model-value="localParams[field.key] ?? 0"
          type="number"
          size="sm"
          @update:model-value="onParamChange(field.key, Number($event))"
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
