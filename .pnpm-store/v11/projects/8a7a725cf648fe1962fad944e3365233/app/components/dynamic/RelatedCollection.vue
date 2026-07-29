<script setup lang="ts">
import type {
  Field,
  PaginatedResponse,
  RelatedCollectionDefinition,
  UiTab
} from '~/types/schema'
import type { ColumnFilters, FilterCondition } from '~/types/filters'
import { buildApiFilters, countActiveFilterConditions } from '~/utils/filterOperators'
import { buildEntityDataQuery } from '~/utils/entityDataQuery'
import { MIME_BY_FILE_EXTENSION } from '~/utils/fileTypes'

type RelatedCapabilities = {
  read: boolean
  create: boolean
  update: boolean
  delete: boolean
}

type RelatedListResponse = PaginatedResponse & {
  capabilities: RelatedCapabilities
}

type RelatedRow = Record<string, any> & { id: string }

type UploadJob = {
  id: string
  file: File
  progress: number
  status: 'queued' | 'uploading' | 'creating' | 'success' | 'error'
  error: string | null
}

const props = defineProps<{
  parentEntity: string
  parentId: string
  tab: UiTab
}>()

const collection = computed(() => props.tab.related_collection as RelatedCollectionDefinition)
const childSlug = computed(() => collection.value.child_entity_slug)
const { apiFetch } = useApi()
const toast = useToast()
const { slug: tenantSlug } = useTenant()
const { data: authData } = useAuth()
const {
  createUploadSession,
  uploadToUrl,
  complete,
  remove: removeFile
} = useFiles()

const {
  schema: childSchema,
  tableFields,
  filterFields,
  fields: childFields,
  loading: schemaLoading,
  error: schemaError
} = useEntitySchema(childSlug)

const items = ref<RelatedRow[]>([])
const meta = ref({
  total: 0,
  page: 1,
  limit: collection.value.page_size,
  totalPages: 0
})
const capabilities = ref<RelatedCapabilities>({
  read: Boolean(collection.value.capabilities.read),
  create: Boolean(collection.value.capabilities.create),
  update: Boolean(collection.value.capabilities.update),
  delete: Boolean(collection.value.capabilities.delete)
})
const loading = ref(false)
const dataError = ref<string | null>(null)
const currentPage = ref(1)
const pageSize = ref(collection.value.page_size)
const currentSort = ref(collection.value.default_sort)
const filters = ref<ColumnFilters>({})
const createOpen = ref(false)
const editOpen = ref(false)
const editingId = ref('')
const quickInput = ref<HTMLInputElement>()
const uploadJobs = ref<UploadJob[]>([])
const batchRunning = ref(false)
const dragActive = ref(false)

const relatedContext = computed(() => ({
  parentSlug: props.parentEntity,
  parentId: props.parentId,
  collectionSlug: props.tab.slug,
  relationFieldSlug: collection.value.relation_field_slug
}))

const profileId = computed(() =>
  (authData.value as { profileId?: string } | null)?.profileId ?? 'anonymous'
)

const preferenceKey = computed(() =>
  `moduvis:related-view:${tenantSlug.value ?? 'default'}:${profileId.value}:${collection.value.id_related_collection}`
)

function allowedDefaultView(): 'table' | 'cards' {
  if (collection.value.default_view === 'cards' && collection.value.allow_cards) return 'cards'
  if (collection.value.allow_table) return 'table'
  return 'cards'
}

const activeView = ref<'table' | 'cards'>(allowedDefaultView())

onMounted(() => {
  const stored = localStorage.getItem(preferenceKey.value)
  if (
    (stored === 'table' && collection.value.allow_table)
    || (stored === 'cards' && collection.value.allow_cards)
  ) {
    activeView.value = stored
  }
})

watch(activeView, (value) => {
  if (import.meta.client) localStorage.setItem(preferenceKey.value, value)
})

const filterableFields = computed(() => {
  const byColumn = new Map<string, Field>()
  for (const field of tableFields.value) byColumn.set(field.column_name, field)
  for (const field of filterFields.value) byColumn.set(field.column_name, field)
  return Array.from(byColumn.values())
})

const apiFilters = computed(() =>
  buildApiFilters(filters.value, filterableFields.value)
)

const activeFilterCount = computed(() =>
  countActiveFilterConditions(filters.value, filterableFields.value)
)

const pageRangeStart = computed(() =>
  meta.value.total === 0 ? 0 : (currentPage.value - 1) * pageSize.value + 1
)

const pageRangeEnd = computed(() =>
  Math.min(currentPage.value * pageSize.value, meta.value.total)
)

const error = computed(() => schemaError.value || dataError.value)

async function loadData() {
  if (!childSchema.value) return
  loading.value = true
  dataError.value = null
  try {
    const query = buildEntityDataQuery({
      page: currentPage.value,
      limit: pageSize.value,
      sort: currentSort.value,
      filter: apiFilters.value
    })
    const response = await apiFetch<RelatedListResponse>(
      `/v1/data/${props.parentEntity}/${props.parentId}/related/${props.tab.slug}`,
      { query }
    )
    items.value = response.data as RelatedRow[]
    meta.value = response.meta
    capabilities.value = response.capabilities
  } catch (err: any) {
    dataError.value = err?.data?.message || err?.message || 'Colectia nu a putut fi incarcata.'
  } finally {
    loading.value = false
  }
}

watch(
  [() => childSchema.value, currentPage, currentSort, filters],
  ([schema]) => {
    if (schema) loadData()
  },
  { deep: true, immediate: true }
)

function updateFilters(next: ColumnFilters) {
  filters.value = next
  currentPage.value = 1
}

function updateColumnFilter(columnName: string, conditions: FilterCondition[]) {
  filters.value = {
    ...filters.value,
    [columnName]: conditions
  }
  currentPage.value = 1
}

function updateSort(sort: string) {
  currentSort.value = sort
  currentPage.value = 1
}

function clearFilters() {
  filters.value = {}
  currentPage.value = 1
}

function openEdit(recordId: string) {
  editingId.value = recordId
  editOpen.value = true
}

async function removeRecord(recordId: string): Promise<boolean> {
  try {
    await apiFetch(
      `/v1/data/${props.parentEntity}/${props.parentId}/related/${props.tab.slug}/${recordId}`,
      { method: 'DELETE' }
    )
    return true
  } catch (err: any) {
    toast.add({
      title: 'Stergerea a esuat',
      description: err?.data?.message || err?.message,
      color: 'error'
    })
    return false
  }
}

function fieldForCard(fieldId: string): Field | undefined {
  return childFields.value.find(field => field.id_field === fieldId)
}

const cardTitleField = computed(() =>
  collection.value.card_title_field_id
    ? fieldForCard(collection.value.card_title_field_id)
    : undefined
)

const cardFields = computed(() =>
  collection.value.card_fields
    .map(cardField => fieldForCard(cardField.id_field))
    .filter((field): field is Field => !!field)
)

const quickFileField = computed(() =>
  childFields.value.find(field => field.id_field === collection.value.id_quick_add_file_field)
)

const quickAccept = computed(() => {
  const mimeTypes = quickFileField.value?.validation_rules?.allowed_mime_types
  return Array.isArray(mimeTypes) ? mimeTypes.join(',') : undefined
})

function chooseFiles() {
  quickInput.value?.click()
}

function onFilesSelected(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files ?? [])
  ;(event.target as HTMLInputElement).value = ''
  queueFiles(files)
}

function onDrop(event: DragEvent) {
  dragActive.value = false
  queueFiles(Array.from(event.dataTransfer?.files ?? []))
}

function queueFiles(files: File[]) {
  if (!files.length || batchRunning.value) return
  uploadJobs.value = files.map(file => ({
    id: crypto.randomUUID(),
    file,
    progress: 0,
    status: 'queued',
    error: null
  }))
  runBatch()
}

function castDefault(field: Field): unknown {
  const value = field.default_value
  if (value == null) return undefined
  if (field.data_type === 'boolean') return value === 'true'
  if (field.data_type === 'integer') return Number.parseInt(value, 10)
  if (field.data_type === 'numeric') return Number.parseFloat(value)
  return value
}

function quickChildPayload(fileId: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const field of childFields.value) {
    if (field.slug === collection.value.relation_field_slug) continue
    if (field.id_field === collection.value.id_quick_add_file_field) {
      payload[field.slug] = fileId
      continue
    }
    const defaultValue = castDefault(field)
    if (defaultValue !== undefined) payload[field.slug] = defaultValue
    else if (field.data_type === 'boolean') payload[field.slug] = false
  }
  return payload
}

async function processUpload(job: UploadJob) {
  const fileField = quickFileField.value
  if (!fileField) {
    job.status = 'error'
    job.error = 'Campul de fisier nu este disponibil.'
    return
  }

  job.status = 'uploading'
  job.error = null
  job.progress = 0
  let stagedFileId: string | null = null

  try {
    const maxBytes = Number(fileField.validation_rules?.max_file_size_bytes || 100_000_000)
    if (job.file.size > maxBytes) {
      throw new Error(`Fisierul depaseste limita de ${(maxBytes / 1_000_000).toFixed(0)} MB.`)
    }
    const extension = job.file.name.split('.').pop()?.toLowerCase() ?? ''
    const mimeType = MIME_BY_FILE_EXTENSION[extension]
      || job.file.type
      || 'application/octet-stream'
    const session = await createUploadSession({
      fieldId: fileField.id_field,
      relatedContext: {
        parentSlug: props.parentEntity,
        parentId: props.parentId,
        collectionSlug: props.tab.slug
      },
      fileName: job.file.name,
      mimeType,
      sizeBytes: job.file.size,
      idempotencyKey: crypto.randomUUID()
    })
    stagedFileId = session.file.idFile
    if (session.uploadUrl) {
      await uploadToUrl(
        session.uploadUrl,
        job.file,
        session.uploadHeaders,
        (progress) => { job.progress = progress }
      )
      await complete(session.file.idFile)
    }

    job.status = 'creating'
    await apiFetch(
      `/v1/data/${props.parentEntity}/${props.parentId}/related/${props.tab.slug}`,
      {
        method: 'POST',
        body: quickChildPayload(session.file.idFile)
      }
    )
    job.status = 'success'
    job.progress = 100
  } catch (err: any) {
    job.status = 'error'
    job.error = err?.data?.message || err?.message || 'Uploadul a esuat.'
    if (stagedFileId) await removeFile(stagedFileId).catch(() => undefined)
  }
}

async function runBatch() {
  batchRunning.value = true
  let nextIndex = 0
  const worker = async () => {
    while (nextIndex < uploadJobs.value.length) {
      const job = uploadJobs.value[nextIndex++]
      if (job) await processUpload(job)
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, uploadJobs.value.length) }, worker))
  batchRunning.value = false

  const succeeded = uploadJobs.value.filter(job => job.status === 'success').length
  const failed = uploadJobs.value.length - succeeded
  toast.add({
    title: failed === 0
      ? `${succeeded} fisiere adaugate`
      : `${succeeded} adaugate, ${failed} esuate`,
    color: failed === 0 ? 'success' : succeeded > 0 ? 'warning' : 'error'
  })
  await loadData()
}

async function retryJob(job: UploadJob) {
  if (batchRunning.value) return
  batchRunning.value = true
  await processUpload(job)
  batchRunning.value = false
  await loadData()
}
</script>

<template>
  <div class="min-w-0 max-w-full space-y-4 overflow-hidden pt-2">
    <div
      v-if="schemaLoading && !childSchema"
      class="space-y-3"
    >
      <USkeleton class="h-10 w-full" />
      <USkeleton class="h-64 w-full" />
    </div>

    <UAlert
      v-else-if="error && !items.length"
      color="error"
      variant="subtle"
      icon="i-lucide-alert-triangle"
      title="Colectia nu poate fi afisata"
      :description="error"
    >
      <template #actions>
        <UButton
          type="button"
          label="Reincearca"
          variant="outline"
          @click="loadData"
        />
      </template>
    </UAlert>

    <template v-else>
      <div class="rounded-2xl border border-default bg-elevated/30 p-3">
        <div class="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <DynamicFilters
            :model-value="filters"
            :fields="filterFields"
            @update:model-value="updateFilters"
          />

          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <UBadge color="primary" variant="soft">
              {{ meta.total }} total
            </UBadge>
            <UButton
              v-if="activeFilterCount"
              type="button"
              label="Reseteaza filtre"
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="clearFilters"
            />
            <UButtonGroup v-if="collection.allow_table && collection.allow_cards">
              <UButton
                type="button"
                icon="i-lucide-table-2"
                :variant="activeView === 'table' ? 'solid' : 'outline'"
                aria-label="Afiseaza tabel"
                @click="activeView = 'table'"
              />
              <UButton
                type="button"
                icon="i-lucide-layout-grid"
                :variant="activeView === 'cards' ? 'solid' : 'outline'"
                aria-label="Afiseaza carduri"
                @click="activeView = 'cards'"
              />
            </UButtonGroup>
            <UButton
              v-if="capabilities.create"
              type="button"
              :label="`Adauga ${collection.child_label_singular ?? 'inregistrare'}`"
              icon="i-lucide-plus"
              @click="createOpen = true"
            />
          </div>
        </div>
      </div>

      <div
        v-if="collection.quick_add_mode === 'multi_file' && capabilities.create"
        class="rounded-2xl border border-dashed p-4 transition-colors"
        :class="dragActive ? 'border-primary bg-primary/10' : 'border-primary/30 bg-primary/5'"
        @dragenter.prevent="dragActive = true"
        @dragover.prevent="dragActive = true"
        @dragleave.prevent="dragActive = false"
        @drop.prevent="onDrop"
      >
        <input
          ref="quickInput"
          type="file"
          multiple
          class="hidden"
          :accept="quickAccept"
          :disabled="batchRunning"
          @change="onFilesSelected"
        >
        <div class="flex flex-col items-center justify-center gap-2 py-3 text-center">
          <UIcon name="i-lucide-files" class="size-7 text-primary" />
          <div>
            <p class="text-sm font-semibold text-highlighted">
              Trage fisierele aici sau selecteaza-le
            </p>
            <p class="text-xs text-muted">
              Se creeaza cate un {{ collection.child_label_singular ?? 'element' }} pentru fiecare fisier, maximum 3 simultan.
            </p>
          </div>
          <UButton
            type="button"
            label="Selecteaza fisiere"
            icon="i-lucide-upload"
            color="neutral"
            variant="outline"
            :disabled="batchRunning"
            @click="chooseFiles"
          />
        </div>

        <div v-if="uploadJobs.length" class="mt-3 space-y-2">
          <div
            v-for="job in uploadJobs"
            :key="job.id"
            class="flex items-center gap-3 rounded-xl border border-default bg-default p-3"
          >
            <UIcon
              :name="job.status === 'success'
                ? 'i-lucide-circle-check'
                : job.status === 'error'
                  ? 'i-lucide-circle-alert'
                  : 'i-lucide-loader-circle'"
              class="size-5 shrink-0"
              :class="{
                'text-success': job.status === 'success',
                'text-error': job.status === 'error',
                'animate-spin text-primary': job.status === 'uploading' || job.status === 'creating'
              }"
            />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">
                {{ job.file.name }}
              </p>
              <UProgress
                v-if="job.status === 'uploading'"
                :model-value="job.progress"
                size="xs"
                class="mt-1"
              />
              <p v-if="job.error" class="mt-1 text-xs text-error">
                {{ job.error }}
              </p>
            </div>
            <UBadge color="neutral" variant="soft">
              {{ job.status }}
            </UBadge>
            <UButton
              v-if="job.status === 'error'"
              type="button"
              label="Reincearca"
              icon="i-lucide-refresh-cw"
              size="xs"
              color="neutral"
              variant="outline"
              :disabled="batchRunning"
              @click="retryJob(job)"
            />
          </div>
        </div>
      </div>

      <DynamicRecordRenderer
        v-if="loading || items.length"
        :entity="childSlug"
        :records="items"
        :fields="tableFields"
        :loading="loading"
        :mode="activeView"
        :can-update="capabilities.update"
        :can-delete="capabilities.delete"
        :filters="filters"
        :sort="currentSort"
        :sort-fallback="collection.default_sort"
        :card-title-field="cardTitleField"
        :card-fields="cardFields"
        :entity-label="collection.child_label_singular ?? collection.child_entity_name"
        :delete-record="removeRecord"
        @edit="openEdit"
        @reload="loadData"
        @update:sort="updateSort"
        @update-filter="updateColumnFilter"
      />

      <UEmpty
        v-if="!loading && items.length === 0"
        icon="i-lucide-inbox"
        :title="activeFilterCount ? 'Nu am gasit rezultate' : 'Colectia este goala'"
        :description="activeFilterCount
          ? 'Ajusteaza sau reseteaza filtrele.'
          : `Adauga primul ${collection.child_label_singular ?? 'element'} din aceasta colectie.`"
      >
        <template #actions>
          <UButton
            v-if="activeFilterCount"
            type="button"
            label="Reseteaza filtre"
            variant="outline"
            @click="clearFilters"
          />
          <UButton
            v-else-if="capabilities.create"
            type="button"
            label="Adauga"
            icon="i-lucide-plus"
            @click="createOpen = true"
          />
        </template>
      </UEmpty>

      <div class="flex flex-col gap-2 border-t border-default pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p class="text-xs text-muted">
          <template v-if="meta.total">
            {{ pageRangeStart }}-{{ pageRangeEnd }} din {{ meta.total }}
          </template>
          <template v-else>
            0 inregistrari
          </template>
        </p>
        <UPagination
          v-if="meta.totalPages > 1"
          :page="currentPage"
          :items-per-page="pageSize"
          :total="meta.total"
          size="sm"
          @update:page="currentPage = $event"
        />
      </div>
    </template>

    <DynamicInlineCreateModal
      v-model:open="createOpen"
      :entity-slug="childSlug"
      :entity-label="collection.child_label_singular ?? collection.child_entity_name"
      :related-context="relatedContext"
      @created="loadData"
    />

    <DynamicInlineEditModal
      v-if="editingId"
      v-model:open="editOpen"
      :entity-slug="childSlug"
      :entity-label="collection.child_label_singular ?? collection.child_entity_name"
      :record-id="editingId"
      :related-context="relatedContext"
      @saved="loadData"
    />
  </div>
</template>
