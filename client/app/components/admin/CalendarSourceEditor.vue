<script setup lang="ts">
import type { AdminEntity } from '~/types/admin'
import type { CalendarFilter, CalendarSource, CalendarTitleSegment } from '~/types/calendar'
import type { Field } from '~/types/schema'

const props = defineProps<{
  modelValue: CalendarSource
  entities: AdminEntity[]
  filterOperators: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: CalendarSource]
  'remove': []
}>()

function cloneSource(value: CalendarSource): CalendarSource {
  return structuredClone(toRaw(value))
}

const open = ref(true)
const local = ref<CalendarSource>(cloneSource(props.modelValue))
const entityId = computed(() => local.value.id_entity)
const entitySlug = computed(() => props.entities.find(entity => entity.id_entity === entityId.value)?.slug)
const { fields, loading, fetchFields } = useAdminFields(entityId, entitySlug)
let syncingFromParent = false

watch(() => props.modelValue, (value) => {
  syncingFromParent = true
  local.value = cloneSource(value)
  nextTick(() => {
    syncingFromParent = false
  })
}, { deep: true })

watch(local, (value) => {
  if (!syncingFromParent) emit('update:modelValue', cloneSource(value))
}, { deep: true })

watch(entityId, async (next, previous) => {
  if (!next) return
  if (previous && previous !== next) {
    local.value.id_start_field = ''
    local.value.id_end_field = ''
    local.value.title_segments = []
    local.value.filters = []
    local.value.popover_field_ids = []
  }
  await fetchFields()
  local.value.fields = structuredClone(toRaw(fields.value))
  const entity = props.entities.find(item => item.id_entity === next)
  local.value.entity_slug = entity?.slug
  local.value.entity_label = entity?.label_singular ?? entity?.name
  if (!local.value.name && entity) local.value.name = entity.label_plural ?? entity.name
  if (!local.value.id_start_field) {
    local.value.id_start_field = dateFields.value[0]?.id_field ?? ''
  }
  if (!local.value.id_end_field) {
    local.value.id_end_field = dateFields.value.find(field =>
      field.id_field !== local.value.id_start_field
      && field.ui_type === startField.value?.ui_type
    )?.id_field ?? ''
  }
  if (!local.value.title_segments.some(segment => segment.type === 'field') && fields.value[0]) {
    local.value.title_segments.push({ type: 'field', id_field: fields.value[0].id_field })
  }
}, { immediate: true })

const entityOptions = computed(() => props.entities.map(entity => ({
  label: entity.label_plural ?? entity.name,
  value: entity.id_entity
})))

const dateFields = computed(() => fields.value.filter(field =>
  ['datepicker', 'datetimepicker'].includes(field.ui_type)
))
const startField = computed(() => fields.value.find(field => field.id_field === local.value.id_start_field))
const endFieldOptions = computed(() => dateFields.value
  .filter(field => field.id_field !== local.value.id_start_field)
  .filter(field => !startField.value || field.ui_type === startField.value.ui_type)
  .map(field => ({ label: field.name, value: field.id_field })))
const fieldOptions = computed(() => fields.value.map(field => ({
  label: field.name,
  value: field.id_field
})))
const filterFieldOptions = computed(() => fields.value
  .filter(field => field.is_filterable)
  .map(field => ({ label: field.name, value: field.id_field })))

const operatorItems = computed(() => props.filterOperators.map(operator => ({
  label: ({
    eq: 'Este egal cu',
    contains: 'Conține',
    starts_with: 'Începe cu',
    gt: 'Mai mare',
    gte: 'Mai mare sau egal',
    lt: 'Mai mic',
    lte: 'Mai mic sau egal',
    between: 'Între',
    in: 'În listă',
    is_null: 'Este gol'
  } as Record<string, string>)[operator] ?? operator,
  value: operator
})))

function addTitleText() {
  local.value.title_segments.push({ type: 'text', value: ' – ' })
}

function addTitleField() {
  const field = fields.value[0]
  if (!field) return
  local.value.title_segments.push({ type: 'field', id_field: field.id_field })
}

function updateTitleSegment(index: number, patch: Partial<CalendarTitleSegment>) {
  local.value.title_segments[index] = {
    ...local.value.title_segments[index],
    ...patch
  } as CalendarTitleSegment
}

function removeTitleSegment(index: number) {
  local.value.title_segments.splice(index, 1)
}

function addFilter() {
  const field = fields.value.find(item => item.is_filterable)
  if (!field) return
  local.value.filters.push({
    id_field: field.id_field,
    operator: 'eq',
    value: ''
  })
}

function removeFilter(index: number) {
  local.value.filters.splice(index, 1)
}

function filterField(filter: CalendarFilter): Field | undefined {
  return fields.value.find(field => field.id_field === filter.id_field)
}

function endFieldChanged() {
  if (
    local.value.id_end_field
    && !endFieldOptions.value.some(item => item.value === local.value.id_end_field)
  ) {
    local.value.id_end_field = ''
  }
}

watch(() => local.value.id_start_field, endFieldChanged)
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <button type="button" class="flex min-w-0 flex-1 items-center gap-2 text-left" @click="open = !open">
          <span class="size-3 shrink-0 rounded-full" :style="{ backgroundColor: local.color }" />
          <span class="truncate font-semibold">{{ local.name || 'Sursă nouă' }}</span>
          <UBadge :label="local.is_active ? 'Activă' : 'Inactivă'" :color="local.is_active ? 'success' : 'neutral'" variant="subtle" />
          <UIcon :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="ml-auto size-4" />
        </button>
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          aria-label="Șterge sursa"
          @click="emit('remove')"
        />
      </div>
    </template>

    <div v-if="open" class="space-y-6">
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <UFormField label="Entitate" required>
          <USelect
            v-model="local.id_entity"
            :items="entityOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Denumire sursă" required>
          <UInput v-model="local.name" class="w-full" />
        </UFormField>
        <UFormField label="Culoare">
          <div class="flex gap-2">
            <UInput v-model="local.color" type="color" class="w-16" />
            <UInput v-model="local.color" class="min-w-0 flex-1 font-mono" />
          </div>
        </UFormField>
        <div class="flex items-end gap-6 pb-1">
          <UFormField label="Activă">
            <USwitch v-model="local.is_active" />
          </UFormField>
          <UFormField label="Creare">
            <USwitch v-model="local.allow_create" />
          </UFormField>
          <UFormField label="Mutare">
            <USwitch v-model="local.allow_update" />
          </UFormField>
        </div>
      </div>

      <div v-if="loading" class="grid gap-4 md:grid-cols-2">
        <USkeleton class="h-10" />
        <USkeleton class="h-10" />
      </div>
      <div v-else class="grid gap-4 md:grid-cols-2">
        <UFormField label="Câmp început" required>
          <USelect
            v-model="local.id_start_field"
            :items="dateFields.map(field => ({ label: field.name, value: field.id_field }))"
            value-key="value"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Câmp final" required>
          <USelect
            v-model="local.id_end_field"
            :items="endFieldOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>
      </div>

      <section class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 class="text-sm font-semibold">
              Template titlu
            </h4>
            <p class="text-xs text-muted">
              Combină texte fixe și câmpuri. Este obligatoriu cel puțin un câmp.
            </p>
          </div>
          <UButtonGroup>
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              icon="i-lucide-type"
              @click="addTitleText"
            >
              Text
            </UButton>
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              icon="i-lucide-braces"
              @click="addTitleField"
            >
              Câmp
            </UButton>
          </UButtonGroup>
        </div>
        <div
          v-for="(segment, index) in local.title_segments"
          :key="index"
          class="grid grid-cols-[90px_1fr_auto] gap-2"
        >
          <USelect
            :model-value="segment.type"
            :items="[{ label: 'Text', value: 'text' }, { label: 'Câmp', value: 'field' }]"
            value-key="value"
            @update:model-value="value => updateTitleSegment(index, value === 'text' ? { type: 'text', value: '', id_field: undefined } : { type: 'field', id_field: fields[0]?.id_field, value: undefined })"
          />
          <UInput
            v-if="segment.type === 'text'"
            :model-value="segment.value"
            @update:model-value="value => updateTitleSegment(index, { value: String(value ?? '') })"
          />
          <USelect
            v-else
            :model-value="segment.id_field"
            :items="fieldOptions"
            value-key="value"
            @update:model-value="value => updateTitleSegment(index, { id_field: String(value) })"
          />
          <UButton
            icon="i-lucide-x"
            color="error"
            variant="ghost"
            @click="removeTitleSegment(index)"
          />
        </div>
      </section>

      <section class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h4 class="text-sm font-semibold">
              Filtre fixe
            </h4>
            <p class="text-xs text-muted">
              Toate filtrele sunt aplicate cu AND. Folosește „în listă” pentru alternative.
            </p>
          </div>
          <UButton
            size="xs"
            color="neutral"
            variant="outline"
            icon="i-lucide-plus"
            :disabled="!filterFieldOptions.length"
            @click="addFilter"
          >
            Filtru
          </UButton>
        </div>
        <div
          v-for="(filter, index) in local.filters"
          :key="index"
          class="grid gap-2 rounded-lg border border-default p-2 md:grid-cols-[1fr_180px_1fr_auto]"
        >
          <USelect v-model="filter.id_field" :items="filterFieldOptions" value-key="value" />
          <USelect v-model="filter.operator" :items="operatorItems" value-key="value" />
          <UInput
            v-if="filter.operator !== 'is_null'"
            :model-value="String(filter.value ?? '')"
            :placeholder="['in', 'between'].includes(filter.operator) ? 'valori separate prin virgulă' : `Valoare ${filterField(filter)?.name ?? ''}`"
            @update:model-value="value => { filter.value = value }"
          />
          <USelect
            v-else
            :model-value="filter.value === false ? false : true"
            :items="[{ label: 'Este gol', value: true }, { label: 'Nu este gol', value: false }]"
            value-key="value"
            @update:model-value="value => { filter.value = value }"
          />
          <UButton
            icon="i-lucide-x"
            color="error"
            variant="ghost"
            @click="removeFilter(index)"
          />
        </div>
      </section>

      <UFormField label="Câmpuri în popover" description="Maximum 5, în ordinea selectată.">
        <USelectMenu
          v-model="local.popover_field_ids"
          :items="fieldOptions"
          value-key="value"
          multiple
          class="w-full"
        />
      </UFormField>
    </div>
  </UCard>
</template>
