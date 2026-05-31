<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'

const props = defineProps<{
  id: string
  data: {
    nodeType: string
    label: string
    icon: string
    color: string
    parameters: Record<string, any>
  }
  selected?: boolean
}>()

const isCondition = computed(() => props.data.nodeType === 'condition')
const isTrigger = computed(() => props.data.nodeType === 'start')

// Resolve entity display info from node parameters
const entityDisplay = computed(() => {
  const params = props.data.parameters ?? {}
  // Direct entity param (start, app_get_record, app_create_record, app_update_record)
  if (params.entity) {
    return params.entityName ?? params.entity
  }
  // app_get_related: show target entity once resolved
  if (params.relationEntitySlug) {
    return params.relationEntityName ?? params.relationEntitySlug
  }
  return null
})
</script>

<template>
  <div
    class="workflow-node rounded-lg border-2 shadow-sm min-w-[180px] bg-white dark:bg-gray-900 transition-all"
    :class="[
      selected ? 'ring-2 ring-primary-500 border-primary-500' : 'border-gray-200 dark:border-gray-700'
    ]"
  >
    <!-- Header -->
    <div
      class="flex items-center gap-2 px-3 py-2 rounded-t-md"
      :style="{ backgroundColor: data.color + '15', borderBottom: `2px solid ${data.color}30` }"
    >
      <UIcon :name="data.icon" class="size-4 shrink-0" :style="{ color: data.color }" />
      <span class="text-xs font-medium truncate text-gray-800 dark:text-gray-200">
        {{ data.label }}
      </span>
    </div>

    <!-- Body -->
    <div class="px-3 py-2 space-y-0.5">
      <p class="text-[10px] text-gray-500 dark:text-gray-400 truncate">
        {{ data.nodeType }}
      </p>
      <p
        v-if="entityDisplay"
        class="text-[10px] text-gray-600 dark:text-gray-300 truncate font-medium"
      >
        Entitate: {{ entityDisplay }}
      </p>
    </div>

    <!-- Handles -->
    <Handle
      v-if="!isTrigger"
      type="target"
      :position="Position.Left"
      class="w-3! h-3! bg-gray-400! border-2! border-white! dark:border-gray-900!"
    />

    <Handle
      :id="isCondition ? 'true' : undefined"
      type="source"
      :position="Position.Right"
      class="w-3! h-3! border-2! border-white! dark:border-gray-900!"
      :style="{ backgroundColor: isCondition ? '#22c55e' : data.color }"
    />

    <Handle
      v-if="isCondition"
      id="false"
      type="source"
      :position="Position.Right"
      class="w-3! h-3! bg-red-500! border-2! border-white! dark:border-gray-900!"
      :style="{ top: '75%' }"
    />
  </div>
</template>

<style scoped>
.workflow-node:hover {
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.1);
}
</style>
