<script setup lang="ts">
import type { Field } from '~/types/schema'
import type { Form, FormSubmitEvent } from '@nuxt/ui'
import { buildZodSchema } from '~/utils/buildZodSchema'
import { INLINE_CREATE_DEPTH_KEY } from '~/utils/inlineCreate'

const props = defineProps<{
  entitySlug: string
}>()

const emit = defineEmits<{
  created: [record: Record<string, any>]
  cancel: []
}>()

const toast = useToast()

// ─── Adâncime recursivitate ───
const parentDepth = inject(INLINE_CREATE_DEPTH_KEY, 0)
provide(INLINE_CREATE_DEPTH_KEY, parentDepth + 1)

// ─── Schema & Data ───
const {
  formFields,
  groups,
  tabs,
  loading: schemaLoading,
  error: schemaError,
  schema
} = useEntitySchema(props.entitySlug)

const {
  error: dataError,
  create
} = useEntityData(props.entitySlug)

const formState = reactive<Record<string, any>>({})
const submitting = ref(false)

// ─── Form ref ───
const formRef = ref<Form<any> | null>(null)
const activeTab = ref('')

watch(() => groups.value, (newGroups) => {
  if (newGroups.length > 0 && !newGroups.includes(activeTab.value)) {
    activeTab.value = newGroups[0] || ''
  }
}, { immediate: true })

// ─── Dirty tracking ───
const initialFormState = ref<string | null>(null)
const isDirty = computed(() => {
  if (initialFormState.value === null) return false
  return initialFormState.value !== JSON.stringify(formState)
})

function captureInitialState() {
  initialFormState.value = JSON.stringify(formState)
}

// ─── Zod schema ───
const zodSchema = computed(() => {
  if (!formFields.value.length) return null
  return buildZodSchema(formFields.value)
})

// ─── Grupare câmpuri ───
function getFieldsByGroup(groupSlug: string): Field[] {
  return formFields.value
    .filter((f: Field) => f.tab_slug === groupSlug)
    .sort((a, b) => a.rank - b.rank)
}

// ─── Tab-uri ───
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

// ─── Find group with errors ───
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
      title: 'Verificare necesară',
      description: 'Unele câmpuri necesită atenție în alt tab',
      color: 'warning'
    })
  }
}

// ─── Inițializare state ───
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

// ─── Inițializare la încărcarea schemei ───
watch(() => schema.value, (sch) => {
  if (!sch) return
  initFormState()
  captureInitialState()
}, { immediate: true })

// ─── Submit ───
async function onSubmit(event: FormSubmitEvent<Record<string, unknown>>) {
  submitting.value = true

  try {
    const payload = buildPayload(event.data)
    const result = await create(payload)

    if (result) {
      toast.add({
        title: 'Creat cu succes',
        color: 'success'
      })
      emit('created', result)
    } else {
      toast.add({
        title: 'Eroare la salvare',
        description: dataError.value ?? 'A apărut o eroare neașteptată.',
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

const loading = computed(() => schemaLoading.value)

// ─── Expunere pentru modal ───
defineExpose({
  submit: () => formRef.value?.submit(),
  submitting,
  /** Returnează true dacă formularul are modificări nesalvate */
  checkDirty: () => isDirty.value
})
</script>

<template>
  <!-- Loading -->
  <div v-if="loading && !schema" class="space-y-4 py-2">
    <USkeleton class="h-8 w-36" />
    <div class="grid grid-cols-2 gap-3">
      <USkeleton v-for="i in 4" :key="i" class="h-10" />
    </div>
  </div>

  <!-- Error -->
  <div v-else-if="schemaError" class="py-8">
    <UEmpty
      icon="i-lucide-alert-triangle"
      title="Eroare"
      :description="schemaError"
    >
      <template #actions>
        <UButton
          label="Anulează"
          icon="i-lucide-x"
          color="neutral"
          variant="outline"
          @click="emit('cancel')"
        />
      </template>
    </UEmpty>
  </div>

  <!-- Form -->
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
    <!-- Un singur grup: direct -->
    <template v-if="groups.length <= 1">
      <DynamicFormGrid
        :fields="getFieldsByGroup(groups[0] ?? 'general')"
        :form-state="formState"
        :autofocus-first="true"
        @update-field="updateFormField"
      />
    </template>

    <!-- Mai multe grupuri: tabs orizontale -->
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
          :autofocus-first="true"
          @update-field="updateFormField"
        />
      </template>
    </UTabs>
  </UForm>

  <!-- Fallback: schemă fără formFields vizibile — se poate crea oricum -->
  <div v-else class="py-6 text-center">
    <p class="text-sm text-muted mb-4">
      Această entitate nu are câmpuri configurabile. Înregistrarea va fi creată cu valorile implicite.
    </p>
  </div>
</template>
