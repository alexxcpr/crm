<script setup lang="ts">
import type { TextTemplateToken } from '~/composables/useNodeTypes'
import type { DataSource } from '~/composables/useWorkflowDataRegistry'
import type { Field } from '~/types/schema'

const props = defineProps<{
  modelValue: TextTemplateToken[]
  dataSources: DataSource[]
  fetchSourceFields?: (nodeId: string) => Promise<Field[]>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: TextTemplateToken[]]
}>()

const text = ref('')
const sourceNodeId = ref('')
const fields = ref<Field[]>([])

const sourceOptions = computed(() => props.dataSources.map(source => ({
  label: `${source.label} (${source.entitySlug})`,
  value: source.nodeId
})))

const fieldOptions = computed(() => fields.value.map(field => ({
  label: `${field.name} (${field.column_name})`,
  value: field.column_name
})))

function append(token: TextTemplateToken) {
  emit('update:modelValue', [...props.modelValue, token])
}

function addText() {
  if (!text.value) return
  append({ type: 'literal', value: text.value })
  text.value = ''
}

async function selectSource(value: string) {
  sourceNodeId.value = value
  fields.value = props.fetchSourceFields ? await props.fetchSourceFields(value) : []
}

function addField(fieldSlug: string) {
  const field = fields.value.find(item => item.column_name === fieldSlug)
  const source = props.dataSources.find(item => item.nodeId === sourceNodeId.value)
  append({
    type: 'field',
    sourceNodeId: sourceNodeId.value,
    fieldSlug,
    fieldLabel: field?.name ?? fieldSlug,
    sourceLabel: source?.label ?? sourceNodeId.value
  })
}

function remove(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, tokenIndex) => tokenIndex !== index))
}
</script>

<template>
  <div class="space-y-2">
    <div class="min-h-10 rounded border border-default bg-default p-2 flex flex-wrap gap-1">
      <span v-if="!modelValue.length" class="text-xs text-muted italic">Adauga text sau campuri...</span>
      <UButton
        v-for="(token, index) in modelValue"
        :key="index"
        :label="token.type === 'field' ? `${token.fieldLabel} · ${token.sourceLabel}` : token.value"
        :icon="token.type === 'field' ? 'i-lucide-database' : 'i-lucide-text-cursor-input'"
        color="neutral"
        variant="soft"
        size="xs"
        @click="remove(index)"
      />
    </div>

    <div class="flex gap-1.5">
      <UInput v-model="text" size="sm" class="flex-1" placeholder="Text..." @keyup.enter="addText" />
      <UButton icon="i-lucide-plus" size="sm" color="neutral" variant="outline" @click="addText" />
    </div>

    <div class="grid grid-cols-2 gap-1.5">
      <USelect
        :model-value="sourceNodeId"
        :items="sourceOptions"
        value-key="value"
        label-key="label"
        placeholder="Sursa..."
        size="sm"
        @update:model-value="selectSource"
      />
      <USelect
        :model-value="''"
        :items="fieldOptions"
        value-key="value"
        label-key="label"
        placeholder="Insereaza camp..."
        size="sm"
        @update:model-value="addField"
      />
    </div>
    <p class="text-[11px] text-muted">Apasa pe un segment pentru a-l elimina.</p>
  </div>
</template>
