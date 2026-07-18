<script setup lang="ts">
import type { Field } from '~/types/schema'
import type { Form, TabsItem, FormSubmitEvent } from '@nuxt/ui'
import { buildZodSchema } from '~/utils/buildZodSchema'
import { INLINE_CREATE_DEPTH_KEY } from '~/utils/inlineCreate'

type ActiveProfile = {
  id_profile: string
  display_name: string | null
  username: string
  email: string
}

type ApplyRecordStateOptions = {
  fallbackRelationLabels?: boolean
}

const props = defineProps<{
  entity: string
  recordId?: string
}>()

const emit = defineEmits<{
  saved: [record: Record<string, any>]
}>()

const toast = useToast()
const router = useRouter()
const { apiFetch } = useApi()

// ─── Schema & Data ───
const {
  entity: entityMeta,
  formFields,
  groups,
  tabs,
  loading: schemaLoading,
  error: schemaError,
  schema,
  capabilities
} = useEntitySchema(props.entity)

const {
  error: dataError,
  fetchOne,
  create,
  update,
  remove
} = useEntityData(props.entity)

const {
  prefetchRelationOptions,
  seedSelectedRelationOptions
} = useRelationOptionsCache()

const {
  seedEntityRecordHandoff,
  consumeEntityRecordHandoff
} = useEntityRecordHandoff()

provide(INLINE_CREATE_DEPTH_KEY, 0)

const isEditMode = computed(() => !!props.recordId)
const formState = reactive<Record<string, any>>({})
const systemData = reactive({
  date_created: null as string | null,
  date_updated: null as string | null,
  id_profile: undefined as string | undefined,
  profile_display: null as string | null
})
const originalProfileId = ref<string | null>(null)
const activeProfiles = ref<ActiveProfile[]>([])
const profileOptions = computed(() => activeProfiles.value.map(profile => ({
  label: profile.display_name || profile.username || profile.email,
  value: profile.id_profile
})))
const submitting = ref(false)
const submitIntent = ref<'save' | 'copy'>('save')
const copyWindow = shallowRef<Window | null>(null)
const initialLoading = ref(false)

// ─── Dirty tracking (protecție date nesalvate) ───
const initialFormState = ref<string | null>(null)
const showLeaveConfirm = ref(false)

const isDirty = computed(() => {
  if (initialFormState.value === null) return false
  return initialFormState.value !== JSON.stringify(formState)
    || originalProfileId.value !== (systemData.id_profile ?? null)
})

function captureInitialState() {
  initialFormState.value = JSON.stringify(formState)
  originalProfileId.value = systemData.id_profile ?? null
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
  if (submitIntent.value === 'copy') {
    closeCopyWindow()
    submitIntent.value = 'save'
  }

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

function applyRecordState(record: Record<string, any> | null, options: ApplyRecordStateOptions = {}) {
  seedSelectedRelationOptions(formFields.value, record, {
    fallbackToValue: options.fallbackRelationLabels ?? true
  })
  initFormState(record)
  if (!record) return

  systemData.date_created = record.date_created || null
  systemData.date_updated = record.date_updated || null
  systemData.id_profile = record.id_profile || undefined
  originalProfileId.value = systemData.id_profile ?? null
  systemData.profile_display = record.profile_display || null
}

async function fetchActiveProfiles() {
  if (!capabilities.value.change_ownership) return
  activeProfiles.value = await apiFetch<ActiveProfile[]>('/user/profiles/active')
}

function fetchActiveProfilesInBackground() {
  fetchActiveProfiles().catch((err) => {
    console.error('[DynamicForm] Eroare la incarcarea profilelor active:', err)
  })
}

function refreshRelationLabelsInBackground(recordId: string) {
  fetchOne(recordId)
    .then(record => seedSelectedRelationOptions(formFields.value, record))
    .catch((err) => {
      console.error('[DynamicForm] Eroare la reincarcarea etichetelor relatiilor:', err)
    })
}

// ─── Incarcarea record-ului (edit mode) ───
watch(() => schema.value, async (sch) => {
  if (!sch) return

  prefetchRelationOptions(formFields.value).catch((err) => {
    console.error('[DynamicForm] Eroare la preincarcarea relatiilor:', err)
  })

  if (isEditMode.value && props.recordId) {
    const handedOffRecord = consumeEntityRecordHandoff(props.entity, props.recordId)
    if (handedOffRecord) {
      applyRecordState(handedOffRecord, { fallbackRelationLabels: false })
      captureInitialState()
      fetchActiveProfilesInBackground()
      refreshRelationLabelsInBackground(props.recordId)
      return
    }

    initialLoading.value = true
    try {
      const record = await fetchOne(props.recordId)
      applyRecordState(record)
      await fetchActiveProfiles().catch((err) => {
        console.error('[DynamicForm] Eroare la incarcarea profilelor active:', err)
      })
      captureInitialState()
    } finally {
      initialLoading.value = false
    }
  } else {
    initFormState()
    captureInitialState()
  }
}, { immediate: true })

// ─── Submit ───
async function onSubmit(event: FormSubmitEvent<Record<string, unknown>>) {
  submitting.value = true
  const intent = submitIntent.value

  try {
    const payload = buildPayload(event.data)
    if (isEditMode.value && systemData.id_profile !== originalProfileId.value) {
      payload.id_profile = systemData.id_profile
    }
    let result: Record<string, any> | null

    if (intent === 'copy') {
      result = await create(payload)
    } else if (isEditMode.value && props.recordId) {
      result = await update(props.recordId, payload)
    } else {
      result = await create(payload)
    }

    if (result) {
      if (intent === 'copy') {
        openCreatedCopy(result)
        toast.add({
          title: 'Copie creată cu succes',
          description: 'Noua înregistrare a fost deschisă într-un tab nou.',
          color: 'success'
        })
        return
      }

      if (isEditMode.value) {
        for (const field of formFields.value) {
          if (result[field.column_name] !== undefined) {
            formState[field.slug] = result[field.column_name]
          }
        }
        if (result.date_updated) {
          systemData.date_updated = result.date_updated
        }
        if (result.id_profile) {
          systemData.id_profile = result.id_profile
        }
      } else {
        seedEntityRecordHandoff(props.entity, result)
      }
      captureInitialState()

      toast.add({
        title: isEditMode.value ? 'Actualizat cu succes' : 'Creat cu succes',
        color: 'success'
      })
      bypassNextNavigationGuard()
      emit('saved', result)
    } else {
      if (intent === 'copy') {
        closeCopyWindow()
      }

      toast.add({

        title: 'Eroare la salvare',
        description: dataError.value ?? 'A aparut o eroare neasteptata.',
        color: 'error'
      })
    }
  } finally {
    submitting.value = false
    submitIntent.value = 'save'
  }
}

function handleSaveCopy() {
  if (submitting.value || !isEditMode.value || !zodSchema.value) return
  submitIntent.value = 'copy'
  closeCopyWindow()
  copyWindow.value = openBlankCopyWindow()
  formRef.value?.submit()
}

function openBlankCopyWindow(): Window | null {
  if (import.meta.server) return null

  const win = window.open('about:blank', '_blank')
  if (!win) return null

  win.document.title = 'Se creează copia...'
  win.document.body.innerHTML = '<p style="font-family: system-ui, sans-serif; padding: 24px;">Se creează copia...</p>'
  win.focus()
  return win
}

function openCreatedCopy(record: Record<string, any>) {
  if (import.meta.server || !record.id) return

  const href = router.resolve(`/${props.entity}/${record.id}`).href
  const url = new URL(href, window.location.origin).toString()

  if (copyWindow.value && !copyWindow.value.closed) {
    copyWindow.value.location.href = url
    copyWindow.value.focus()
    copyWindow.value = null
    return
  }

  window.open(url, '_blank')?.focus()
}

function closeCopyWindow() {
  if (copyWindow.value && !copyWindow.value.closed) {
    copyWindow.value.close()
  }
  copyWindow.value = null
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

const loading = computed(() =>
  (schemaLoading.value && !schema.value)
  || (isEditMode.value && initialLoading.value)
)

const { visibleActions, executeAction: executeEntityAction } = useEntityActions(computed(() => props.entity))
const executingAction = ref<string | null>(null)
const showActionsSlideover = ref(false)

async function handleAction(actionSlug: string) {
  if (!props.recordId) return
  executingAction.value = actionSlug
  const success = await executeEntityAction(actionSlug, props.recordId)
  executingAction.value = null

  if (success) {
    const record = await fetchOne(props.recordId)
    seedSelectedRelationOptions(formFields.value, record)
    initFormState(record)
    if (record) {
      systemData.date_created = record.date_created || null
      systemData.date_updated = record.date_updated || null
      systemData.id_profile = record.id_profile || undefined
      originalProfileId.value = systemData.id_profile ?? null
      systemData.profile_display = record.profile_display || null
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

function bypassNextNavigationGuard() {
  bypassGuard.value = true
  nextTick(() => {
    if (bypassGuard.value) {
      bypassGuard.value = false
    }
  })
}

function revertForm() {
  if (initialFormState.value === null) return
  const initial = JSON.parse(initialFormState.value)
  for (const key of Object.keys(formState)) {
    formState[key] = initial[key] ?? null
  }
  systemData.id_profile = originalProfileId.value ?? undefined
}

// Browser-level guard (refresh, tab close)
const onBeforeUnload = (e: BeforeUnloadEvent) => {
  if (isDirty.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}

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
// NOTĂ: Nu folosim alt_s prin defineShortcuts din cauza unui bug în Nuxt UI 4.4.0
// care nu verifică e.altKey în bucla principală, blocând tasta "s" în input-uri.
// Folosim un event listener manual care verifică toate modificatorele corect.
function onFormKeydown(e: KeyboardEvent) {
  // Alt+S: Submit formular (cu dirty check)
  if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 's') {
    if (submitting.value) return
    if (!isDirty.value) return
    if (showDeleteConfirm.value || showLeaveConfirm.value) return
    if (!zodSchema.value) return
    e.preventDefault()
    formRef.value?.submit()
    return
  }

  // Escape: Înapoi (cu dirty check)
  if (e.key === 'Escape') {
    if (submitting.value) return
    if (showDeleteConfirm.value || showLeaveConfirm.value) return
    if (isDirty.value) {
      showLeaveConfirm.value = true
      return
    }
    router.push(`/${props.entity}`)
  }
}

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('keydown', onFormKeydown)
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener('keydown', onFormKeydown)
})
</script>

<template>
  <!-- Loading state -->
  <div v-if="loading" class="space-y-6 p-6">
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
    :loading-auto="false"
    class="flex flex-col flex-1"
    @submit="onSubmit"
    @error="onFormError"
  >
    <div class="flex gap-6 flex-1 pt-6">
      <!-- Left: form fields + actions -->
      <div class="flex-1 min-w-0 space-y-6">
        <!-- Single group: render directly -->
        <template v-if="groups.length <= 1">
          <DynamicFormGrid
            :fields="getFieldsByGroup(groups[0] ?? 'general')"
            :form-state="formState"
            :autofocus-first="!isEditMode"
            :record-id="recordId"
            @update-field="updateFormField"
          />
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
            list: 'w-full md:w-52 shrink-0 max-w-full max-h-[20vh] md:max-h-[70vh] overflow-x-auto md:overflow-x-hidden md:overflow-y-auto rounded-xl border border-primary/20 bg-primary/5 p-1 md:p-1.5 gap-1 shadow-sm',
            indicator: 'hidden',
            trigger: 'relative min-w-48 shrink-0 md:w-full justify-center md:justify-start text-center md:text-left rounded-lg px-3 py-2 text-[13px] font-semibold text-muted transition-all hover:bg-white/80 hover:text-highlighted hover:shadow-xs dark:hover:bg-white/10 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:ring-1 data-[state=active]:ring-primary/30 before:content-[\'\'] before:hidden md:before:block before:absolute before:left-1 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-transparent data-[state=active]:before:bg-white/80',
            content: 'w-full flex-1 min-w-0'
          }"
        >
          <template v-for="(group, idx) in groups" :key="group" #[group]>
            <div class="pt-2 md:pt-0">
              <DynamicFormGrid
                :fields="getFieldsByGroup(group)"
                :form-state="formState"
                :autofocus-first="!isEditMode && idx === 0"
                :record-id="recordId"
                @update-field="updateFormField"
              />
            </div>
          </template>
        </UTabs>
      </div>

      <!-- Right: Entity Actions sidebar (doar pe desktop) -->
      <div
        v-if="isEditMode && visibleActions.length > 0"
        class="hidden lg:block w-72 shrink-0"
      >
        <div class="sticky top-2 rounded-2xl border border-primary/20 bg-primary/5 p-3 shadow-sm">
          <div class="mb-3 flex items-center gap-2">
            <div class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
              <UIcon name="i-lucide-command" class="size-4" />
            </div>
            <div class="min-w-0 flex-1">
              <h3 class="text-sm font-semibold text-highlighted">
                Actiuni
              </h3>
              <p class="text-xs text-muted">
                Procese disponibile pentru record
              </p>
            </div>
            <UBadge color="primary" variant="soft" size="sm">
              {{ visibleActions.length }}
            </UBadge>
          </div>

          <div class="space-y-2">
            <div
              v-for="action in visibleActions"
              :key="action.id_action"
              class="group flex w-full items-center gap-2 rounded-xl border border-default bg-white/80 p-2 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:bg-white hover:shadow-md dark:bg-gray-900/80 dark:hover:bg-gray-900"
            >
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left disabled:pointer-events-none disabled:opacity-70"
                :disabled="executingAction === action.slug"
                @click="handleAction(action.slug)"
              >
                <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                  <UIcon
                    :name="executingAction === action.slug ? 'i-lucide-loader-circle' : 'i-lucide-zap'"
                    class="size-4"
                    :class="{ 'animate-spin': executingAction === action.slug }"
                  />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-semibold text-highlighted">
                    {{ action.name }}
                  </span>
                </span>
                <UIcon
                  name="i-lucide-chevron-right"
                  class="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                />
              </button>

              <UPopover
                v-if="action.description"
                :content="{ align: 'end' }"
              >
                <UButton
                  icon="i-lucide-info"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  class="self-center shrink-0 rounded-full text-muted hover:text-primary hover:bg-primary/10"
                />
                <template #content>
                  <div class="max-w-72 p-3 text-sm">
                    {{ action.description }}
                  </div>
                </template>
              </UPopover>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Sticky bottom bar — mereu vizibil -->
    <div class="sticky bottom-0 z-20 -mx-3 -mb-3 px-3 pb-0 bg-white dark:bg-gray-900 border-t border-default overflow-visible after:content-[''] after:absolute after:inset-x-0 after:top-full after:h-4 after:bg-white dark:after:bg-gray-900">
      <div class="space-y-1 pt-1.5 pb-0">
        <!-- Linia 1: Metadate -->
        <div v-if="isEditMode" class="flex items-center gap-4 text-[13px] text-muted">
          <div class="flex items-center gap-1.5">
            <UIcon name="i-lucide-calendar-plus" class="size-3.5" />
            <span>Creat {{ formatDate(systemData.date_created) }}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <UIcon name="i-lucide-calendar-check" class="size-3.5" />
            <span>Modificat {{ formatDate(systemData.date_updated) }}</span>
          </div>
          <div class="flex items-center gap-1.5 ml-auto">
            <UIcon name="i-lucide-user" class="size-3.5" />
            <USelectMenu
              v-if="capabilities.change_ownership"
              v-model="systemData.id_profile"
              :items="profileOptions"
              value-key="value"
              size="xs"
              class="min-w-44"
            />
            <span v-else-if="systemData.profile_display">{{ systemData.profile_display }}</span>
            <span v-else class="text-muted">-</span>
          </div>
        </div>

        <!-- Linia 2: Butoane -->
        <div class="flex flex-wrap sm:flex-nowrap items-center gap-2">
          <UButton
            v-if="isEditMode ? capabilities.update : capabilities.create"
            type="submit"
            :label="isEditMode ? 'Salvează' : 'Creează'"
            icon="i-lucide-check"
            variant="solid"
            :size="isMobile ? 'sm' : 'md'"
            :loading="submitting && submitIntent === 'save'"
            :disabled="!isDirty"
            @click="submitIntent = 'save'"
          />
          <UButton
            v-if="isEditMode && capabilities.create"
            type="button"
            :label="isMobile ? '' : 'Salvează copie'"
            icon="i-lucide-copy"
            color="primary"
            variant="soft"
            :size="isMobile ? 'sm' : 'md'"
            :loading="submitting && submitIntent === 'copy'"
            :disabled="submitting"
            @click="handleSaveCopy"
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

          <!-- Acțiuni workflow (mobil) -->
          <UButton
            v-if="isEditMode && capabilities.update && visibleActions.length > 0"
            :label="isMobile ? '' : 'Acțiuni'"
            icon="i-lucide-zap"
            color="primary"
            variant="soft"
            :size="isMobile ? 'sm' : 'md'"
            class="lg:hidden"
            @click="showActionsSlideover = true"
          />

          <!-- Șterge — împins în dreapta -->
          <UButton
            v-if="isEditMode && capabilities.delete"
            :label="isMobile ? '' : 'Șterge'"
            icon="i-lucide-trash-2"
            color="error"
            variant="outline"
            :size="isMobile ? 'sm' : 'md'"
            class="ml-auto"
            @click="showDeleteConfirm = true"
          />
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
        <div class="rounded-2xl border border-primary/20 bg-primary/5 p-3">
          <div class="mb-3 flex items-center gap-2">
            <div class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
              <UIcon name="i-lucide-command" class="size-4" />
            </div>
            <div class="min-w-0 flex-1">
              <h3 class="text-sm font-semibold text-highlighted">
                Actiuni disponibile
              </h3>
              <p class="text-xs text-muted">
                {{ visibleActions.length }} workflow-uri pentru record
              </p>
            </div>
          </div>

          <div class="space-y-2">
            <div
              v-for="action in visibleActions"
              :key="action.id_action"
              class="group flex w-full items-center gap-2 rounded-xl border border-default bg-white/80 p-2 text-left shadow-xs transition-all active:scale-[0.99] hover:border-primary/35 hover:bg-white dark:bg-gray-900/80 dark:hover:bg-gray-900"
            >
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left disabled:pointer-events-none disabled:opacity-70"
                :disabled="executingAction === action.slug"
                @click="handleAction(action.slug)"
              >
                <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                  <UIcon
                    :name="executingAction === action.slug ? 'i-lucide-loader-circle' : 'i-lucide-zap'"
                    class="size-4"
                    :class="{ 'animate-spin': executingAction === action.slug }"
                  />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-semibold text-highlighted">
                    {{ action.name }}
                  </span>
                </span>
                <UIcon
                  name="i-lucide-chevron-right"
                  class="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                />
              </button>

              <UPopover
                v-if="action.description"
                :content="{ align: 'end' }"
              >
                <UButton
                  icon="i-lucide-info"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  class="self-center shrink-0 rounded-full text-muted hover:text-primary hover:bg-primary/10"
                />
                <template #content>
                  <div class="max-w-72 p-3 text-sm">
                    {{ action.description }}
                  </div>
                </template>
              </UPopover>
            </div>
          </div>
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
