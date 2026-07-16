<script setup lang="ts">
import type { NotificationRecipient } from '~/composables/useNodeTypes'
import type { DataSource } from '~/composables/useWorkflowDataRegistry'
import type { Field } from '~/types/schema'

interface ProfileOption {
  id_profile: string
  display_name: string | null
  username: string
  email: string
}

const props = defineProps<{
  modelValue: NotificationRecipient | null
  dataSources: DataSource[]
  fetchSourceFields?: (nodeId: string) => Promise<Field[]>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: NotificationRecipient]
}>()

const { apiFetch } = useApi()
const sourceType = ref<NotificationRecipient['sourceType']>(props.modelValue?.sourceType ?? 'static')
const profiles = ref<ProfileOption[]>([])
const fields = ref<Field[]>([])

const sourceOptions = [
  { label: 'Profil ales', value: 'static' },
  { label: 'Din datele workflow-ului', value: 'node_output' }
]

const profileOptions = computed(() => profiles.value.map(profile => ({
  label: profile.display_name || profile.username || profile.email,
  value: profile.id_profile
})))

const dataSourceOptions = computed(() => props.dataSources.map(source => ({
  label: `${source.label} (${source.entitySlug})`,
  value: source.nodeId
})))

const fieldOptions = computed(() => fields.value
  .filter(field => field.data_type === 'uuid')
  .map(field => ({ label: `${field.name} (${field.column_name})`, value: field.column_name })))

watch(() => props.modelValue, (value) => {
  sourceType.value = value?.sourceType ?? 'static'
}, { immediate: true })

onMounted(async () => {
  profiles.value = await apiFetch<ProfileOption[]>('/user/profiles/active')
  if (props.modelValue?.sourceNodeId && props.fetchSourceFields) {
    fields.value = await props.fetchSourceFields(props.modelValue.sourceNodeId)
  }
})

function changeType(value: string) {
  sourceType.value = value as NotificationRecipient['sourceType']
  emit('update:modelValue', { sourceType: sourceType.value })
}

function selectProfile(profileId: string) {
  emit('update:modelValue', { sourceType: 'static', profileId })
}

async function selectSource(sourceNodeId: string) {
  fields.value = props.fetchSourceFields ? await props.fetchSourceFields(sourceNodeId) : []
  const source = props.dataSources.find(item => item.nodeId === sourceNodeId)
  emit('update:modelValue', {
    sourceType: 'node_output',
    sourceNodeId,
    sourceLabel: source?.label
  })
}

function selectField(sourceFieldSlug: string) {
  const field = fields.value.find(item => item.column_name === sourceFieldSlug)
  emit('update:modelValue', {
    ...props.modelValue,
    sourceType: 'node_output',
    sourceFieldSlug,
    fieldLabel: field?.name
  })
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

    <USelect
      v-if="sourceType === 'static'"
      :model-value="modelValue?.profileId ?? ''"
      :items="profileOptions"
      value-key="value"
      label-key="label"
      placeholder="Selecteaza profilul..."
      size="sm"
      class="w-full"
      @update:model-value="selectProfile"
    />

    <template v-else>
      <USelect
        :model-value="modelValue?.sourceNodeId ?? ''"
        :items="dataSourceOptions"
        value-key="value"
        label-key="label"
        placeholder="Selecteaza sursa..."
        size="sm"
        class="w-full"
        @update:model-value="selectSource"
      />
      <USelect
        :model-value="modelValue?.sourceFieldSlug ?? ''"
        :items="fieldOptions"
        value-key="value"
        label-key="label"
        placeholder="Selecteaza campul UUID..."
        size="sm"
        class="w-full"
        @update:model-value="selectField"
      />
    </template>
  </div>
</template>
