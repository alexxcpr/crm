<script setup lang="ts">
import type { RecordIdSource } from '~/composables/useNodeTypes'

const props = defineProps<{
  modelValue: RecordIdSource | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: RecordIdSource]
}>()

const sourceType = ref<RecordIdSource['sourceType']>(props.modelValue?.sourceType ?? 'static')
const value = ref(props.modelValue?.value ?? '')

watch(() => props.modelValue, (v) => {
  sourceType.value = v?.sourceType ?? 'static'
  value.value = v?.value ?? ''
})

function emitUpdate() {
  emit('update:modelValue', {
    sourceType: sourceType.value,
    value: value.value
  })
}

const sourceOptions = [
  { label: 'Valoare fixa', value: 'static' },
  { label: 'Din inreg. curenta', value: 'current_record' },
  { label: 'Din nodul anterior', value: 'previous_node' }
]

const payloadFieldOptions = [
  { label: 'ID inregistrare (id)', value: 'id' },
  { label: 'ID inregistrare (recordId)', value: 'recordId' },
  { label: 'Entitate (entity)', value: 'entity' },
  { label: 'ID Entitate (entityId)', value: 'entityId' },
  { label: 'ID Utilizator (userId)', value: 'userId' }
]
</script>

<template>
  <div class="space-y-2">
    <USelect
      :model-value="sourceType"
      :items="sourceOptions"
      value-key="value"
      label-key="label"
      size="sm"
      @update:model-value="(v: string) => { sourceType = v as RecordIdSource['sourceType']; emitUpdate() }"
    />

    <UInput
      v-if="sourceType === 'static' || sourceType === 'previous_node'"
      :model-value="value"
      size="sm"
      :placeholder="sourceType === 'static' ? 'ID-ul inregistrarii' : 'ex: id (din raspunsul nodului anterior)'"
      @update:model-value="(v: string) => { value = v; emitUpdate() }"
    />

    <USelect
      v-else
      :model-value="value"
      :items="payloadFieldOptions"
      value-key="value"
      label-key="label"
      size="sm"
      @update:model-value="(v: string) => { value = v; emitUpdate() }"
    />
  </div>
</template>
