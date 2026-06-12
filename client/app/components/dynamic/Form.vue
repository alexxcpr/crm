<script setup lang="ts">
import type { Field, UiTab } from '~/types/schema'
import type { Form, TabsItem, FormSubmitEvent } from '@nuxt/ui'
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
  tabs,
  loading: schemaLoading,
  error: schemaError,
  schema
} = useEntitySchema(props.entity)

const {
  loading: dataLoading,
  error: dataError,
  fetchOne,
  create,
  update,
  remove
} = useEntityData(props.entity)

const isEditMode = computed(() => !!props.recordId)
const formState = reactive<Record<string, any>>({})
const systemData = reactive({
  date_created: null as string | null,
  date_updated: null as string | null,
  id_owner: null as string | null,
  owner_email: null as string | null,
  owner_name: null as string | null
})
const submitting = ref(false)
const initialLoading = ref(false)

// ─── Dirty tracking (protecție date nesalvate) ───
const initialFormState = ref<string | null>(null)
const showLeaveConfirm = ref(false)

const isDirty = computed(() => {
  if (initialFormState.value === null) return false
  return initialFormState.value !== JSON.stringify(formState)
})

function captureInitialState() {
  initialFormState.value = JSON.stringify(formState)
}

// ─── Form ref for error handling ───
const formRef = ref<Form<any> | null>(null)
const activeTab = ref('')

// Initialize activeTab when groups are loaded
watch(() => groups.value, (newGroups) => {
  if (newGroups.length > 0 && !newGroups.includes(activeTab.value)) {
    activeTab.value = newGroups[0] || ''
  }
}, { immediate: true })

// ─── Find which group contains fields with errors ───
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

// ─── Handler for form validation errors ───
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

// ─── Schema Zod (reactiva — se reconstruieste cand schema se incarca) ───
const zodSchema = computed(() => {
  if (!formFields.value.length) return null
  return buildZodSchema(formFields.value)
})

// ─── Detectare mobil ───
const isMobile = computed(() => {
  if (import.meta.server) return false
  return window.matchMedia('(max-width: 640px)').matches
})

// ─── Grupuri campuri pentru layout ───
function getFieldsByGroup(groupSlug: string): Field[] {
  return formFields.value
    .filter((f: Field) => f.tab_slug === groupSlug)
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

// Folosește utilitarul de formatare pentru metadate
const formatDate = formatMetadataDate

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
    if (record) {
      systemData.date_created = record.date_created || null
      systemData.date_updated = record.date_updated || null
      systemData.id_owner = record.id_owner || null
      systemData.owner_email = record.owner_email || null // NOU
      systemData.owner_name = record.owner_name || null
    }
    captureInitialState()
    initialLoading.value = false
  }
  else {
    initFormState()
    captureInitialState()
  }
}, { immediate: true })

// ─── Submit ───
async function onSubmit(event: FormSubmitEvent<Record<string, unknown>>) {
  submitting.value = true

  try {
    const payload = buildPayload(event.data)
    let result: Record<string, any> | null

    if (isEditMode.value && props.recordId) {
      result = await update(props.recordId, payload)
    } 
    else {
      result = await create(payload)
    }

    if (result) {
      for (const field of formFields.value) {
        if (result[field.column_name] !== undefined) {
          formState[field.slug] = result[field.column_name]
        }
      }
      if (result.date_updated) {
        systemData.date_updated = result.date_updated
      }

      toast.add({
        title: isEditMode.value ? 'Actualizat cu succes' : 'Creat cu succes',
        color: 'success'
      })
      captureInitialState()
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

const loading = computed(() => schemaLoading.value || initialLoading.value)

const { visibleActions, executeAction: executeEntityAction } = useEntityActions(computed(() => props.entity))
const executingAction = ref<string | null>(null)
const showActionsSlideover = ref(false)

async function handleAction(actionSlug: string, actionName: string) {
  if (!props.recordId) return
  executingAction.value = actionSlug
  const success = await executeEntityAction(actionSlug, props.recordId)
  executingAction.value = null

  if (success) {
    const record = await fetchOne(props.recordId)
    initFormState(record)
    if (record) {
      systemData.date_created = record.date_created || null
      systemData.date_updated = record.date_updated || null
      systemData.id_owner = record.id_owner || null
      systemData.owner_email = record.owner_email || null
      systemData.owner_name = record.owner_name || null
    }
    captureInitialState()
  }
}

// ─── Navigare cu date nesalvate ───

const leaveTarget = ref<string | null>(null)
const bypassGuard = ref(false)

// In-app navigation guard (sidebar clicks, back button)
onBeforeRouteLeave((to, _from) => {
  if (bypassGuard.value) {
    bypassGuard.value = false
    return
  }
  if (isDirty.value) {
    leaveTarget.value = to.fullPath
    showLeaveConfirm.value = true
    return false
  }
})

function confirmLeave() {
  showLeaveConfirm.value = false
  bypassGuard.value = true
  if (leaveTarget.value) {
    router.push(leaveTarget.value)
  } else {
    router.back()
  }
}

function cancelLeave() {
  showLeaveConfirm.value = false
  leaveTarget.value = null
}

function revertForm() {
  if (initialFormState.value === null) return
  const initial = JSON.parse(initialFormState.value)
  for (const key of Object.keys(formState)) {
    formState[key] = initial[key] ?? null
  }
}

// Browser-level guard (refresh, tab close)
const onBeforeUnload = (e: BeforeUnloadEvent) => {
  if (isDirty.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload)
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
})

// ─── Delete ───
const showDeleteConfirm = ref(false)
const deleting = ref(false)
const deleteError = ref<string | null>(null)

async function confirmDelete() {
  if (!props.recordId) return
  deleting.value = true
  deleteError.value = null
  const success = await remove(props.recordId)
  deleting.value = false
  if (success) {
    showDeleteConfirm.value = false
    toast.add({ title: 'Inregistrare stearsa', color: 'success' })
    bypassGuard.value = true
    router.replace(`/${props.entity}`)
  } else {
    deleteError.value = dataError.value ?? 'Stergerea a esuat.'
  }
}

// ─── Shortcuts ───
defineShortcuts({
  alt_s: {
    handler: () => {
      if (submitting.value) return
      if (!isDirty.value) return
      if (showDeleteConfirm.value || showLeaveConfirm.value) return
      if (!zodSchema.value) return
      formRef.value?.submit()
    },
    usingInput: true
  },
  escape: () => {
    if (submitting.value) return
    if (showDeleteConfirm.value || showLeaveConfirm.value) return
    if (isDirty.value) {
      showLeaveConfirm.value = true
      return
    }
    router.push(`/${props.entity}`)
  }
})
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
    ref="formRef"
    :state="formState"
    :schema="zodSchema"
    class="space-y-6"
    @submit="onSubmit"
    @error="onFormError"
  >
    <div class="flex gap-6">
      <!-- Left: form fields + actions -->
      <div class="flex-1 min-w-0 space-y-6">
        <!-- Single group: render directly -->
        <template v-if="groups.length <= 1">
          <DynamicFormGrid :fields="getFieldsByGroup(groups[0] ?? 'general')" :form-state="formState" :autofocus-first="!isEditMode" />
        </template>

        <!-- Multiple groups: use tabs -->
        <UTabs
          v-else
          v-model="activeTab"
          :items="tabItems"
          orientation="vertical"
          class="w-full"
          :ui="{
            root: 'flex flex-col md:flex-row items-start gap-6',
            list: 'w-full md:w-56 shrink-0 max-h-[20vh] md:max-h-[70vh] overflow-y-auto',
            trigger: 'justify-start w-full text-left snap-center shrink-0',
            content: 'w-full flex-1 min-w-0'
          }"
        >
          <template v-for="(group, idx) in groups" :key="group" #[group]>
            <div class="pt-2 md:pt-0">
              <DynamicFormGrid :fields="getFieldsByGroup(group)" :form-state="formState" :autofocus-first="!isEditMode && idx === 0" />
            </div>
          </template>
        </UTabs>

        <!-- Metadate - collapsable pe mobil -->
        <template v-if="isEditMode">
          <UCollapsible
            class="flex flex-col gap-2 w-full"
            :default-open="!isMobile"
          >
            <template #default="{ open }">
              <UButton
                color="neutral"
                variant="ghost"
                class="w-full justify-between"
              >
                <USeparator class="w-full">
                  <span class="text-xs text-muted uppercase tracking-wider flex items-center gap-2">
                    <span>Metadate</span>
                    <UIcon
                      name="i-lucide-chevron-down"
                      class="size-4 transition-transform duration-200"
                      :class="{ 'rotate-180': open }"
                    />
                  </span>
                </USeparator>
              </UButton>
            </template>

            <template #content>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 text-sm">
                <div class="bg-elevated/50 rounded-lg p-3 text-center sm:text-left">
                  <div class="text-xs text-muted uppercase mb-1">
                    Creat
                  </div>
                  <div class="font-medium">
                    {{ formatDate(systemData.date_created) }}
                  </div>
                </div>
                <div class="bg-elevated/50 rounded-lg p-3 text-center sm:text-left">
                  <div class="text-xs text-muted uppercase mb-1">
                    Modificat
                  </div>
                  <div class="font-medium">
                    {{ formatDate(systemData.date_updated) }}
                  </div>
                </div>
                <div class="bg-elevated/50 rounded-lg p-3 text-center sm:text-left">
                  <div class="text-xs text-muted uppercase mb-1">
                    Deținător
                  </div>
                  <div class="flex items-center justify-center sm:justify-start gap-2">
                    <UIcon name="i-lucide-user" class="text-muted" />
                    <span v-if="systemData.owner_email" class="font-medium">
                      {{ systemData.owner_email }}
                    </span>
                    <span v-else class="text-muted">-</span>
                  </div>
                </div>
              </div>
            </template>
          </UCollapsible>
        </template>

        <!-- Actions -->
        <div class="flex flex-wrap items-center gap-2 pt-4 border-t border-default">
          <UButton
            type="submit"
            :label="isEditMode ? 'Salveaza' : 'Creeaza'"
            icon="i-lucide-check"
            :size="isMobile ? 'sm' : 'md'"
            :loading="submitting"
            :disabled="!isDirty"
          />
          <UButton
            v-if="isDirty"
            :label="isMobile ? '' : 'Revino'"
            icon="i-lucide-undo-2"
            color="neutral"
            variant="outline"
            :size="isMobile ? 'sm' : 'md'"
            @click="revertForm"
          />
          <UButton
            v-if="isEditMode && visibleActions.length > 0"
            :label="isMobile ? '' : 'Actiuni'"
            icon="i-lucide-zap"
            color="primary"
            variant="soft"
            :size="isMobile ? 'sm' : 'md'"
            class="lg:hidden"
            @click="showActionsSlideover = true"
          />
          <UButton
            v-if="isEditMode"
            :label="isMobile ? '' : 'Sterge'"
            icon="i-lucide-trash-2"
            color="error"
            variant="outline"
            :size="isMobile ? 'sm' : 'md'"
            :class="isMobile ? '' : 'ml-auto'"
            @click="showDeleteConfirm = true"
          />
        </div>
      </div>

      <!-- Right: Entity Actions sidebar (doar pe desktop) -->
      <div
        v-if="isEditMode && visibleActions.length > 0"
        class="hidden lg:block w-64 shrink-0"
      >
        <div class="sticky top-2 border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-white dark:bg-gray-900 space-y-3">
          <h3 class="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 tracking-wider">
            Actiuni workflow
          </h3>
          <div class="space-y-2">
            <div
              v-for="action in visibleActions"
              :key="action.id_action"
              class="flex items-center gap-1"
            >
              <UButton
                :label="action.name"
                icon="i-lucide-zap"
                color="primary"
                variant="soft"
                size="sm"
                block
                class="flex-1 text-left justify-start"
                :loading="executingAction === action.slug"
                @click="handleAction(action.slug, action.name)"
              />
              <UPopover
                v-if="action.description"
                :content="{ align: 'end' }"
              >
                <UIcon
                  name="i-lucide-info"
                  class="size-4 text-muted shrink-0 cursor-pointer hover:text-primary transition-colors"
                />
                <template #content>
                  <div class="p-3 max-w-72 text-sm">
                    {{ action.description }}
                  </div>
                </template>
              </UPopover>
            </div>
          </div>
        </div>
      </div>
    </div>
  </UForm>

  <!-- Delete Confirm Modal -->
  <UModal v-model:open="showDeleteConfirm" title="Confirmare stergere">
    <template #body>
      <p>
        Esti sigur ca vrei sa stergi aceasta inregistrare?
        <strong v-if="entityMeta?.label_singular">
          ({{ entityMeta.label_singular }})
        </strong>
      </p>
      <p class="text-sm text-muted mt-1">
        Aceasta actiune este permanenta si nu poate fi anulata.
      </p>
      <p
        v-if="deleteError"
        class="text-sm text-red-500 mt-2"
      >
        {{ deleteError }}
      </p>
      <div class="flex items-center gap-3 justify-end mt-4">
        <UButton
          label="Anuleaza"
          color="neutral"
          variant="outline"
          @click="showDeleteConfirm = false"
        />
        <UButton
          label="Sterge"
          color="error"
          icon="i-lucide-trash-2"
          :loading="deleting"
          @click="confirmDelete"
        />
      </div>
    </template>
  </UModal>

  <!-- Actions Slideover (mobil) -->
  <USlideover
    v-model:open="showActionsSlideover"
    title="Acțiuni workflow"
    :side="'right'"
  >
    <template #body>
      <div class="space-y-3">
        <div
          v-for="action in visibleActions"
          :key="action.id_action"
          class="flex items-center gap-2"
        >
          <UButton
            :label="action.name"
            icon="i-lucide-zap"
            color="primary"
            variant="soft"
            size="md"
            block
            class="flex-1 text-left justify-start"
            :loading="executingAction === action.slug"
            @click="handleAction(action.slug, action.name)"
          />
          <UPopover
            v-if="action.description"
            :content="{ align: 'end' }"
          >
            <UIcon
              name="i-lucide-info"
              class="size-5 text-muted shrink-0 cursor-pointer hover:text-primary transition-colors"
            />
            <template #content>
              <div class="p-3 max-w-72 text-sm">
                {{ action.description }}
              </div>
            </template>
          </UPopover>
        </div>
      </div>
    </template>
  </USlideover>

  <!-- Leave Confirm Modal (date nesalvate) -->
  <UModal v-model:open="showLeaveConfirm" title="Modificari nesalvate">
    <template #body>
      <div class="space-y-4">
        <div class="flex items-start gap-3">
          <div class="bg-amber-100 dark:bg-amber-900/30 rounded-full p-2 shrink-0">
            <UIcon name="i-lucide-triangle-alert" class="size-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p class="font-medium">
              Ai modificari care nu au fost salvate.
            </p>
            <p class="text-sm text-muted mt-1">
              Daca parasesti pagina fara sa salvezi, toate datele completate vor fi pierdute.
            </p>
          </div>
        </div>
        <div class="flex items-center gap-3 justify-end">
          <UButton
            label="Ramai pe pagina"
            color="primary"
            variant="solid"
            icon="i-lucide-pencil"
            @click="cancelLeave"
          />
          <UButton
            label="Paraseste oricum"
            color="neutral"
            variant="outline"
            icon="i-lucide-log-out"
            @click="confirmLeave"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
