<script setup lang="ts">
import { useSortable } from '@vueuse/integrations/useSortable'
import type {
  CalendarDefinition,
  CalendarSource,
  CalendarView
} from '~/types/calendar'

const props = defineProps<{
  calendarId?: string
}>()

const { features } = useFeatures()
const enabled = computed(() => features.value.calendars === true)
const {
  catalog,
  loading,
  error,
  fetchCatalog,
  fetchCalendar,
  saveCalendar
} = useAdminCalendars()
const { entities, fetchEntities } = useAdminEntities()
const toast = useToast()
const sourcesRoot = useTemplateRef<HTMLElement | null>('sourcesRoot')
const slugManuallyEdited = ref(Boolean(props.calendarId))

const state = ref<CalendarDefinition>({
  name: '',
  slug: '',
  description: null,
  icon: 'i-lucide-calendar-days',
  default_view: 'month',
  allow_day: true,
  allow_week: true,
  allow_month: true,
  allow_list: true,
  list_range: 'month',
  first_day: 1,
  show_weekends: true,
  slot_min_time: '00:00',
  slot_max_time: '24:00',
  scroll_time: '08:00',
  slot_duration_minutes: 30,
  rank: 0,
  is_active: true,
  sources: []
})

const sources = computed({
  get: () => state.value.sources,
  set: (value) => {
    state.value.sources = value.map((source, rank) => ({ ...source, rank }))
  }
})

useSortable(sourcesRoot, sources, {
  handle: '.source-drag-handle',
  animation: 180
})

if (enabled.value) {
  await Promise.all([fetchCatalog(), fetchEntities()])
  if (props.calendarId) {
    const existing = await fetchCalendar(props.calendarId)
    if (existing) state.value = structuredClone(existing)
  }
}

watch(() => state.value.name, (name) => {
  if (slugManuallyEdited.value) return
  state.value.slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
})

const viewSettings = [
  { key: 'allow_day', view: 'day', label: 'Zi' },
  { key: 'allow_week', view: 'week', label: 'Săptămână' },
  { key: 'allow_month', view: 'month', label: 'Lună' },
  { key: 'allow_list', view: 'list', label: 'Listă' }
] as const

const allowedViewOptions = computed(() => viewSettings
  .filter(item => state.value[item.key])
  .map(item => ({ label: item.label, value: item.view })))

const timeOptions = computed(() => {
  const values: { label: string, value: string }[] = []
  for (let hour = 0; hour <= 24; hour++) {
    const value = `${String(hour).padStart(2, '0')}:00`
    values.push({ label: value, value })
  }
  return values
})

const scrollOptions = computed(() => {
  const values: { label: string, value: string }[] = []
  for (let hour = 0; hour < 24; hour++) {
    for (const minute of [0, 30]) {
      const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
      values.push({ label: value, value })
    }
  }
  return values
})

const activeSourceCount = computed(() => state.value.sources.filter(source => source.is_active).length)

watch(allowedViewOptions, (items) => {
  if (!items.length) {
    state.value.allow_month = true
    state.value.default_view = 'month'
    return
  }
  if (!items.some(item => item.value === state.value.default_view)) {
    state.value.default_view = items[0]!.value as CalendarView
  }
})

function addSource() {
  if (activeSourceCount.value >= (catalog.value?.limits.activeSources ?? 10)) return
  const entity = entities.value[0]
  const source: CalendarSource = {
    id_ui_calendar_source: crypto.randomUUID(),
    id_entity: entity?.id_entity ?? '',
    entity_slug: entity?.slug,
    entity_label: entity?.label_singular ?? entity?.name,
    name: entity ? entity.label_plural ?? entity.name : `Sursă ${state.value.sources.length + 1}`,
    color: '#2563eb',
    id_start_field: '',
    id_end_field: '',
    title_segments: [],
    filters: [],
    popover_field_ids: [],
    allow_create: true,
    allow_update: true,
    rank: state.value.sources.length,
    is_active: true
  }
  state.value.sources.push(source)
}

function updateSource(index: number, source: CalendarSource) {
  state.value.sources[index] = source
}

function removeSource(index: number) {
  state.value.sources.splice(index, 1)
  state.value.sources.forEach((source, rank) => {
    source.rank = rank
  })
}

function clientValidation() {
  if (!state.value.name.trim() || !state.value.slug.trim()) {
    return 'Denumirea și slug-ul sunt obligatorii.'
  }
  if (state.value.is_active && !activeSourceCount.value) {
    return 'Calendarul activ trebuie să aibă cel puțin o sursă activă.'
  }
  if (activeSourceCount.value > (catalog.value?.limits.activeSources ?? 10)) {
    return 'Sunt active prea multe surse.'
  }
  for (const source of state.value.sources) {
    if (!source.id_entity || !source.id_start_field || !source.id_end_field) {
      return `Completează entitatea și intervalul sursei "${source.name || 'fără nume'}".`
    }
    if (!source.title_segments.some(segment => segment.type === 'field')) {
      return `Titlul sursei "${source.name || 'fără nume'}" trebuie să conțină un câmp.`
    }
    if (source.popover_field_ids.length > (catalog.value?.limits.popoverFields ?? 5)) {
      return `Sursa "${source.name}" are prea multe câmpuri în popover.`
    }
  }
  return null
}

async function save() {
  const validationError = clientValidation()
  if (validationError) {
    toast.add({ title: 'Configurație incompletă', description: validationError, color: 'warning' })
    return
  }
  const saved = await saveCalendar(state.value)
  if (!saved) {
    toast.add({ title: 'Calendarul nu a fost salvat', description: error.value ?? '', color: 'error' })
    return
  }
  state.value = structuredClone(saved)
  toast.add({ title: 'Calendar salvat', color: 'success' })
  if (!props.calendarId) {
    await navigateTo(`/builder/calendars/${saved.id_ui_calendar}`)
  }
}
</script>

<template>
  <UPageCard
    v-if="!enabled"
    icon="i-lucide-lock-keyhole"
    title="Calendarele nu sunt active"
    description="Activează add-on-ul Calendare configurabile pentru a deschide builder-ul."
  >
    <template #footer>
      <UButton label="Vezi abonamentul" to="/admin/billing" icon="i-lucide-credit-card" />
    </template>
  </UPageCard>

  <div v-else-if="catalog" class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 class="text-lg font-semibold">
          {{ calendarId ? 'Editează calendar' : 'Calendar nou' }}
        </h2>
        <p class="text-sm text-muted">
          Configurează pagina, sursele și modul în care înregistrările devin evenimente.
        </p>
      </div>
      <div class="flex gap-2">
        <UButton
          label="Înapoi"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="outline"
          to="/builder/calendars"
        />
        <UButton
          label="Salvează"
          icon="i-lucide-save"
          :loading="loading"
          @click="save"
        />
      </div>
    </div>

    <UCard>
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <UFormField label="Denumire" required>
          <UInput v-model="state.name" class="w-full" />
        </UFormField>
        <UFormField label="Slug" required>
          <UInput v-model="state.slug" class="w-full" @input="slugManuallyEdited = true" />
        </UFormField>
        <UFormField label="Icon">
          <UInput v-model="state.icon" class="w-full" />
        </UFormField>
        <UFormField label="Activ">
          <USwitch v-model="state.is_active" class="mt-2" />
        </UFormField>
      </div>
      <UFormField label="Descriere" class="mt-4">
        <UTextarea v-model="state.description" class="w-full" />
      </UFormField>
    </UCard>

    <UCard>
      <template #header>
        <div>
          <h3 class="font-semibold">
            Vederi și grilă
          </h3>
          <p class="text-xs text-muted">
            Setările se aplică tuturor surselor din calendar.
          </p>
        </div>
      </template>

      <div class="grid gap-5 lg:grid-cols-2">
        <div class="space-y-4">
          <div class="flex flex-wrap gap-5">
            <UFormField v-for="item in viewSettings" :key="item.key" :label="item.label">
              <USwitch v-model="state[item.key]" />
            </UFormField>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Vedere implicită">
              <USelect
                v-model="state.default_view"
                :items="allowedViewOptions"
                value-key="value"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Perioada listei">
              <USelect
                v-model="state.list_range"
                :items="catalog.listRanges"
                value-key="value"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Prima zi a săptămânii">
              <USelect
                v-model="state.first_day"
                :items="[
                  { label: 'Duminică', value: 0 },
                  { label: 'Luni', value: 1 },
                  { label: 'Marți', value: 2 },
                  { label: 'Miercuri', value: 3 },
                  { label: 'Joi', value: 4 },
                  { label: 'Vineri', value: 5 },
                  { label: 'Sâmbătă', value: 6 }
                ]"
                value-key="value"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Afișează weekend">
              <USwitch v-model="state.show_weekends" class="mt-2" />
            </UFormField>
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Ora de început">
            <USelect
              v-model="state.slot_min_time"
              :items="timeOptions.filter(item => item.value !== '24:00')"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Ora de final">
            <USelect
              v-model="state.slot_max_time"
              :items="timeOptions.filter(item => item.value !== '00:00')"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Pas slot">
            <USelect
              v-model="state.slot_duration_minutes"
              :items="catalog.slotDurations.map(value => ({ label: `${value} minute`, value }))"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Scroll inițial">
            <USelect
              v-model="state.scroll_time"
              :items="scrollOptions"
              value-key="value"
              class="w-full"
            />
          </UFormField>
        </div>
      </div>
    </UCard>

    <div class="flex items-center justify-between gap-4">
      <div>
        <h3 class="font-semibold">
          Surse
        </h3>
        <p class="text-sm text-muted">
          {{ activeSourceCount }} din {{ catalog.limits.activeSources }} surse active.
        </p>
      </div>
      <UButton
        label="Adaugă sursă"
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        :disabled="activeSourceCount >= catalog.limits.activeSources"
        @click="addSource"
      />
    </div>

    <div ref="sourcesRoot" class="space-y-4">
      <div v-for="(source, index) in state.sources" :key="source.id_ui_calendar_source ?? index" class="relative">
        <UButton
          class="source-drag-handle absolute -left-3 top-4 z-10 cursor-grab rounded-full shadow-sm active:cursor-grabbing"
          icon="i-lucide-grip-vertical"
          color="neutral"
          variant="solid"
          size="xs"
          aria-label="Mută sursa"
        />
        <AdminCalendarSourceEditor
          :model-value="source"
          :entities="entities"
          :filter-operators="catalog.filterOperators"
          @update:model-value="value => updateSource(index, value)"
          @remove="removeSource(index)"
        />
      </div>
    </div>

    <UEmpty
      v-if="!state.sources.length"
      icon="i-lucide-calendar-plus"
      title="Nicio sursă"
      description="Adaugă o entitate și alege câmpurile care definesc intervalul."
    >
      <template #actions>
        <UButton label="Adaugă sursă" icon="i-lucide-plus" @click="addSource" />
      </template>
    </UEmpty>

    <section class="space-y-3">
      <div>
        <h3 class="font-semibold">
          Preview live
        </h3>
        <p class="text-sm text-muted">
          Date reale, filtrate cu permisiunile tale. Actualizarea este debounced și anulează drafturile vechi.
        </p>
      </div>
      <AdminCalendarBuilderPreview :calendar="state" />
    </section>
  </div>

  <UAlert
    v-else-if="error"
    color="error"
    variant="subtle"
    title="Builder indisponibil"
    :description="error"
  />
  <USkeleton v-else class="h-96 w-full" />
</template>
