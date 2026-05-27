<script setup lang="ts">
import type { FieldMapping, FieldValueSource } from '~/composables/useNodeTypes'
import type { Field } from '~/types/schema'

const props = defineProps<{
  modelValue: FieldMapping[]
  entitySlug: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: FieldMapping[]]
}>()

const { apiFetch } = useApi()

// ─── Entity fields fetch ───
const entityFields = ref<Field[]>([])
const fieldsLoading = ref(false)

watch(() => props.entitySlug, async (slug) => {
  if (!slug) {
    entityFields.value = []
    return
  }
  fieldsLoading.value = true
  try {
    const data = await apiFetch<{ entity: any; fields: Field[] }>(`/v1/schema/${slug}`)
    entityFields.value = data.fields ?? []
  } catch {
    entityFields.value = []
  } finally {
    fieldsLoading.value = false
  }
}, { immediate: true })

const fieldOptions = computed(() =>
  entityFields.value.map(f => ({ label: `${f.name} (${f.slug})`, value: f.slug }))
)

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
  emitUpdate()
}

function updateValue(index: number, value: string) {
  if (!mappings.value[index]) return
  mappings.value[index].value = value
  emitUpdate()
}

// ─── Source options ───
const sourceOptions: { label: string; value: FieldValueSource }[] = [
  { label: 'Valoare fixa', value: 'static' },
  { label: 'Din inreg. curenta', value: 'current_record' },
  { label: 'Din nodul anterior', value: 'previous_node' }
]

// ─── Payload field options for "current_record" ───
const payloadFieldOptions = [
  { label: 'ID inregistrare (id)', value: 'id' },
  { label: 'ID inregistrare (recordId)', value: 'recordId' },
  { label: 'Entitate (entity)', value: 'entity' },
  { label: 'ID Entitate (entityId)', value: 'entityId' },
  { label: 'ID Utilizator (userId)', value: 'userId' },
  { label: 'Tenant (tenant)', value: 'tenant' },
  { label: 'Timestamp', value: 'timestamp' },
  { label: 'Actiune (action)', value: 'action' }
]

// Track which rows are in "custom field" mode
const customFieldMode = ref<Record<number, boolean>>({})

function getValueOptions(index: number) {
  const custom = { label: 'Alt camp (scrie manual)...', value: '__custom__' }
  return [...payloadFieldOptions, custom]
}

function onValueSelect(index: number, val: string) {
  if (val === '__custom__') {
    customFieldMode.value[index] = true
    updateValue(index, '')
  } else {
    customFieldMode.value[index] = false
    updateValue(index, val)
  }
}
</script>

<template>
  <div class="space-y-3">
    <!-- Rows -->
    <div
      v-for="(mapping, idx) in mappings"
      :key="idx"
      class="border border-gray-200 dark:border-gray-700 rounded-md p-2.5 space-y-2"
    >
      <div class="flex items-center gap-1.5">
        <USelect
          :model-value="mapping.key"
          :items="fieldOptions"
          value-key="value"
          label-key="label"
          size="xs"
          placeholder="Camp..."
          :loading="fieldsLoading"
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

      <USelect
        :model-value="mapping.sourceType"
        :items="sourceOptions"
        value-key="value"
        label-key="label"
        size="xs"
        @update:model-value="(v: FieldValueSource) => updateSourceType(idx, v)"
      />

      <UInput
        v-if="mapping.sourceType === 'static'"
        :model-value="mapping.value"
        size="xs"
        placeholder="ex: Ana, 5, true"
        @update:model-value="(v: string) => updateValue(idx, v)"
      />

      <template v-else-if="mapping.sourceType === 'current_record'">
        <USelect
          v-if="!customFieldMode[idx]"
          :model-value="mapping.value"
          :items="getValueOptions(idx)"
          value-key="value"
          label-key="label"
          size="xs"
          @update:model-value="(v: string) => onValueSelect(idx, v)"
        />
        <div v-else class="flex items-center gap-1.5">
          <UInput
            :model-value="mapping.value"
            size="xs"
            placeholder="Numele campului din payload"
            class="flex-1"
            @update:model-value="(v: string) => updateValue(idx, v)"
          />
          <UButton
            icon="i-lucide-list"
            color="neutral"
            variant="ghost"
            size="xs"
            title="Inapoi la lista"
            @click="customFieldMode[idx] = false"
          />
        </div>
      </template>

      <UInput
        v-else-if="mapping.sourceType === 'previous_node'"
        :model-value="mapping.value"
        size="xs"
        placeholder="ex: id, nume, email (din raspunsul nodului anterior)"
        @update:model-value="(v: string) => updateValue(idx, v)"
      />
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
