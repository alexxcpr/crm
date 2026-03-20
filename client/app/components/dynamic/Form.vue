<script setup lang="ts">
import type { Field } from '~/types/schema'
import type { TabsItem } from '@nuxt/ui'
import { buildZodSchema } from '~/utils/buildZodSchema'

const props = defineProps<{
  entity: string
  recordId?: string
}>()

const emit = defineEmits<{
  saved: [record: Record<string, any>]
}>()

const toast = useToast()
const router = useRouter()

// ─── Schema & Data ───
const {
  entity: entityMeta,
  formFields,
  groups,
  loading: schemaLoading,
  error: schemaError,
  schema
} = useEntitySchema(props.entity)

const {
  loading: dataLoading,
  error: dataError,
  fetchOne,
  create,
  update
} = useEntityData(props.entity)

const isEditMode = computed(() => !!props.recordId)
const formState = reactive<Record<string, any>>({})
const submitting = ref(false)
const initialLoading = ref(false)

// ─── Schema Zod (reactiva — se reconstruieste cand schema se incarca) ───
const zodSchema = computed(() => {
  if (!formFields.value.length) return null
  return buildZodSchema(formFields.value)
})

// ─── Grupuri campuri pentru layout ───
function getFieldsByGroup(groupName: string): Field[] {
  return formFields.value
    .filter(f => f.group_name === groupName)
    .sort((a, b) => a.rank - b.rank)
}

// ─── Tab-uri (doar daca > 1 grup) ───
const tabItems = computed<TabsItem[]>(() =>
  groups.value.map(g => ({
    label: formatGroupLabel(g),
    value: g,
    slot: g
  }))
)

function formatGroupLabel(groupName: string): string {
  return groupName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase())
}

// ─── Initializare state ───
function initFormState(record?: Record<string, any> | null) {
  for (const field of formFields.value) {
    if (record && record[field.column_name] !== undefined) {
      formState[field.slug] = record[field.column_name]
    }
    else if (field.default_value != null) {
      formState[field.slug] = castDefault(field)
    }
    else if (field.data_type === 'boolean') {
      formState[field.slug] = false
    }
    else {
      formState[field.slug] = null
    }
  }
}

function castDefault(field: Field): any {
  const val = field.default_value
  if (val == null) return null
  if (field.data_type === 'boolean') return val === 'true'
  if (field.data_type === 'integer') return parseInt(val, 10)
  if (field.data_type === 'numeric') return parseFloat(val)
  return val
}

// ─── Incarcarea record-ului (edit mode) ───
watch(() => schema.value, async (sch) => {
  if (!sch) return

  if (isEditMode.value && props.recordId) {
    initialLoading.value = true
    const record = await fetchOne(props.recordId)
    initFormState(record)
    initialLoading.value = false
  }
  else {
    initFormState()
  }
}, { immediate: true })

// ─── Submit ───
async function onSubmit() {
  submitting.value = true

  try {
    const payload = buildPayload()
    let result: Record<string, any> | null

    if (isEditMode.value && props.recordId) {
      result = await update(props.recordId, payload)
    }
    else {
      result = await create(payload)
    }

    if (result) {
      toast.add({
        title: isEditMode.value ? 'Actualizat cu succes' : 'Creat cu succes',
        color: 'success'
      })
      emit('saved', result)
    }
    else {
      toast.add({
        title: 'Eroare la salvare',
        description: dataError.value ?? 'A aparut o eroare neasteptata.',
        color: 'error'
      })
    }
  }
  finally {
    submitting.value = false
  }
}

function buildPayload(): Record<string, any> {
  const payload: Record<string, any> = {}
  for (const field of formFields.value) {
    const val = formState[field.slug]
    if (val !== undefined) {
      payload[field.slug] = val
    }
  }
  return payload
}

const loading = computed(() => schemaLoading.value || initialLoading.value)
</script>

<template>
  <!-- Loading state -->
  <div v-if="loading && !schema" class="space-y-6 p-6">
    <USkeleton class="h-8 w-48" />
    <div class="grid grid-cols-3 gap-4">
      <USkeleton v-for="i in 6" :key="i" class="h-10" />
    </div>
  </div>

  <!-- Error state -->
  <div v-else-if="schemaError" class="py-12">
    <UEmpty icon="i-lucide-alert-triangle" title="Eroare" :description="schemaError">
      <template #actions>
        <UButton label="Inapoi" icon="i-lucide-arrow-left" @click="router.back()" />
      </template>
    </UEmpty>
  </div>

  <!-- Form -->
  <UForm
    v-else-if="zodSchema"
    :state="formState"
    :schema="zodSchema"
    class="space-y-6"
    @submit="onSubmit"
  >
    <!-- Single group: render directly -->
    <template v-if="groups.length <= 1">
      <DynamicFormGrid :fields="getFieldsByGroup(groups[0] ?? 'general')" :form-state="formState" />
    </template>

    <!-- Multiple groups: use tabs -->
    <UTabs v-else :items="tabItems" :default-value="groups[0]" class="w-full">
      <template v-for="group in groups" :key="group" #[group]>
        <div class="pt-4">
          <DynamicFormGrid :fields="getFieldsByGroup(group)" :form-state="formState" />
        </div>
      </template>
    </UTabs>

    <!-- Actions -->
    <div class="flex items-center gap-3 pt-4 border-t border-default">
      <UButton
        type="submit"
        :label="isEditMode ? 'Salveaza' : 'Creeaza'"
        icon="i-lucide-check"
        :loading="submitting"
      />
      <UButton
        label="Anuleaza"
        color="neutral"
        variant="outline"
        icon="i-lucide-x"
        @click="router.back()"
      />
    </div>
  </UForm>
</template>
