<script setup lang="ts">
import type { Field } from '~/types/schema'
import type { Form, FormSubmitEvent } from '@nuxt/ui'
import { buildZodSchema } from '~/utils/buildZodSchema'
import { INLINE_CREATE_DEPTH_KEY } from '~/utils/inlineCreate'

const props = defineProps<{
  entitySlug: string
  recordId: string
}>()

const emit = defineEmits<{
  saved: [record: Record<string, any>]
  cancel: []
}>()

const toast = useToast()

const parentDepth = inject(INLINE_CREATE_DEPTH_KEY, 0)
provide(INLINE_CREATE_DEPTH_KEY, parentDepth + 1)

const {
  formFields,
  groups,
  tabs,
  loading: schemaLoading,
  error: schemaError,
  schema,
  capabilities
} = useEntitySchema(props.entitySlug)

const {
  error: dataError,
  fetchOne,
  update
} = useEntityData(props.entitySlug)

const {
  prefetchRelationOptions,
  seedSelectedRelationOptions
} = useRelationOptionsCache()

const formState = reactive<Record<string, any>>({})
const submitting = ref(false)
const initialLoading = ref(false)
const formRef = ref<Form<any> | null>(null)
const activeTab = ref('')

const initialFormState = ref<string | null>(null)
const isDirty = computed(() => {
  if (initialFormState.value === null) return false
  return initialFormState.value !== JSON.stringify(formState)
})

const canSave = computed(() => !!capabilities.value.update)
const loading = computed(() =>
  (schemaLoading.value && !schema.value)
  || initialLoading.value
)

watch(() => groups.value, (newGroups) => {
  if (newGroups.length > 0 && !newGroups.includes(activeTab.value)) {
    activeTab.value = newGroups[0] || ''
  }
}, { immediate: true })

const zodSchema = computed(() => {
  if (!formFields.value.length) return null
  return buildZodSchema(formFields.value)
})

const tabLabelMap = computed(() => {
  const map = new Map<string, string>()
  for (const t of tabs.value) {
    map.set(t.slug, t.name)
  }
  return map
})

function formatGroupLabel(groupSlug: string): string {
  return tabLabelMap.value.get(groupSlug)
    || groupSlug.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function getFieldsByGroup(groupSlug: string): Field[] {
  return formFields.value
    .filter((f: Field) => f.tab_slug === groupSlug)
    .sort((a, b) => a.rank - b.rank)
}

function findGroupWithErrors(errorFields: string[]): string | null {
  for (const group of groups.value) {
    const groupFields = getFieldsByGroup(group).map(f => f.slug)
    const hasErrorInGroup = errorFields.some(fieldName =>
      groupFields.includes(fieldName)
    )
    if (hasErrorInGroup) return group
  }
  return null
}

function onFormError(event: { errors: Array<{ name?: string, message?: string }> }) {
  const errorFieldNames = event.errors
    .map(e => e.name)
    .filter((name): name is string => !!name)
  const targetGroup = findGroupWithErrors(errorFieldNames)

  if (targetGroup && targetGroup !== activeTab.value) {
    activeTab.value = targetGroup
    toast.add({
      title: 'Verificare necesara',
      description: 'Unele campuri necesita atentie in alt tab',
      color: 'warning'
    })
  }
}

function initFormState(record?: Record<string, any> | null) {
  for (const field of formFields.value) {
    if (record && record[field.column_name] !== undefined) {
      formState[field.slug] = record[field.column_name]
    } else if (field.default_value != null) {
      formState[field.slug] = castDefault(field)
    } else if (field.data_type === 'boolean') {
      formState[field.slug] = false
    } else {
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

function captureInitialState() {
  initialFormState.value = JSON.stringify(formState)
}

function applyRecordState(record: Record<string, any> | null) {
  seedSelectedRelationOptions(formFields.value, record)
  initFormState(record)
}

watch([() => schema.value, () => props.recordId], async ([sch]) => {
  if (!sch) return

  prefetchRelationOptions(formFields.value).catch((err) => {
    console.error('[InlineEditForm] Eroare la preincarcarea relatiilor:', err)
  })

  initialLoading.value = true
  try {
    const record = await fetchOne(props.recordId)
    applyRecordState(record)
    captureInitialState()
  } finally {
    initialLoading.value = false
  }
}, { immediate: true })

async function onSubmit(event: FormSubmitEvent<Record<string, unknown>>) {
  if (!canSave.value) return
  submitting.value = true

  try {
    const payload = buildPayload(event.data)
    const result = await update(props.recordId, payload)

    if (result) {
      applyRecordState(result)
      captureInitialState()
      toast.add({
        title: 'Actualizat cu succes',
        color: 'success'
      })
      emit('saved', result)
    } else {
      toast.add({
        title: 'Eroare la salvare',
        description: dataError.value ?? 'A aparut o eroare neasteptata.',
        color: 'error'
      })
    }
  } finally {
    submitting.value = false
  }
}

function buildPayload(validated: Record<string, unknown>): Record<string, any> {
  const payload: Record<string, any> = {}
  for (const field of formFields.value) {
    const val = validated[field.slug]
    if (val !== undefined) {
      payload[field.slug] = val
    }
  }
  return payload
}

function updateFormField(payload: { slug: string, value: any }) {
  formState[payload.slug] = payload.value
}

defineExpose({
  submit: () => formRef.value?.submit(),
  submitting,
  canSave,
  checkDirty: () => isDirty.value
})
</script>

<template>
  <div v-if="loading" class="space-y-4 py-2">
    <USkeleton class="h-8 w-36" />
    <div class="grid grid-cols-2 gap-3">
      <USkeleton v-for="i in 4" :key="i" class="h-10" />
    </div>
  </div>

  <div v-else-if="schemaError" class="py-8">
    <UEmpty
      icon="i-lucide-alert-triangle"
      title="Eroare"
      :description="schemaError"
    >
      <template #actions>
        <UButton
          label="Anuleaza"
          icon="i-lucide-x"
          color="neutral"
          variant="outline"
          @click="emit('cancel')"
        />
      </template>
    </UEmpty>
  </div>

  <UForm
    v-else-if="zodSchema"
    ref="formRef"
    :state="formState"
    :schema="zodSchema"
    :loading-auto="false"
    class="flex flex-col flex-1"
    @submit="onSubmit"
    @error="onFormError"
  >
    <template v-if="groups.length <= 1">
      <DynamicFormGrid
        :fields="getFieldsByGroup(groups[0] ?? 'general')"
        :form-state="formState"
        :autofocus-first="false"
        @update-field="updateFormField"
      />
    </template>

    <UTabs
      v-else
      v-model="activeTab"
      :items="groups.map(g => ({ label: formatGroupLabel(g), value: g, slot: g }))"
      class="w-full"
      :ui="{
        root: 'flex flex-col gap-4',
        list: 'w-full overflow-x-auto rounded-xl border border-primary/20 bg-primary/5 p-1 gap-1',
        indicator: 'hidden',
        trigger: 'relative shrink-0 rounded-lg px-3 py-2 text-[13px] font-semibold text-muted transition-all hover:bg-white/80 hover:text-highlighted hover:shadow-xs data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-md',
        content: 'w-full'
      }"
    >
      <template v-for="group in groups" :key="group" #[group]>
        <DynamicFormGrid
          :fields="getFieldsByGroup(group)"
          :form-state="formState"
          :autofocus-first="false"
          @update-field="updateFormField"
        />
      </template>
    </UTabs>
  </UForm>

  <div v-else class="py-6 text-center">
    <p class="text-sm text-muted mb-4">
      Aceasta entitate nu are campuri configurabile.
    </p>
  </div>
</template>
