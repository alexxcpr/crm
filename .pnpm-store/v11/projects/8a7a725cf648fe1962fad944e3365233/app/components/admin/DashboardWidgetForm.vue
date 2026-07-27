<script setup lang="ts">
import type { AdminEntity } from '~/types/admin'
import type { DashboardCatalog, DashboardFilter, DashboardWidget } from '~/types/dashboard'
import type { EntitySchema, Field } from '~/types/schema'
import type { FilterCondition } from '~/types/filters'

const props = defineProps<{
  widget: DashboardWidget
  entities: AdminEntity[]
  catalog: DashboardCatalog
}>()

const emit = defineEmits<{
  save: [widget: DashboardWidget]
  cancel: []
}>()

const { apiFetch } = useApi()
const state = reactive<DashboardWidget>(structuredClone(toRaw(props.widget)))
const fields = ref<Field[]>([])
const fieldsLoading = ref(false)
const newFilterFieldId = ref('')
const validationError = ref<string | null>(null)

const selectedEntity = computed(() => props.entities.find(entity => entity.id_entity === state.id_entity))
const entityOptions = computed(() => props.entities.map(entity => ({
  label: entity.label_plural ?? entity.name,
  value: entity.id_entity
})))
const numericFields = computed(() => fields.value.filter(field => ['integer', 'numeric'].includes(field.data_type)))
const categoryFields = computed(() => fields.value.filter(field => field.ui_type === 'relation' || ['varchar', 'boolean', 'uuid'].includes(field.data_type)))
const dateFields = computed(() => fields.value.filter(field => field.data_type === 'datetime'))
const filterableFields = computed(() => fields.value.filter(field => field.is_filterable))
const usesValueField = computed(() => state.aggregation !== 'count')
const isChart = computed(() => state.widget_type === 'chart')
const usesCategory = computed(() => isChart.value && state.group_mode === 'category')
const usesTime = computed(() => isChart.value && state.group_mode === 'time')
const usesCustomDate = computed(() => state.date_source === 'field')
const valueFieldModel = computed({ get: () => state.id_value_field ?? undefined, set: value => { state.id_value_field = value ?? null } })
const chartTypeModel = computed({ get: () => state.chart_type ?? undefined, set: value => { state.chart_type = value ?? null } })
const groupModeModel = computed({ get: () => state.group_mode ?? undefined, set: value => { state.group_mode = value ?? null } })
const groupFieldModel = computed({ get: () => state.id_group_field ?? undefined, set: value => { state.id_group_field = value ?? null } })
const seriesFieldModel = computed({ get: () => state.id_series_field ?? undefined, set: value => { state.id_series_field = value ?? null } })
const dateFieldModel = computed({ get: () => state.id_date_field ?? undefined, set: value => { state.id_date_field = value ?? null } })

const fieldOptions = (items: Field[]) => items.map(field => ({ label: field.name, value: field.id_field }))

watch(() => state.id_entity, async (entityId, previous) => {
  if (previous && previous !== entityId) {
    state.id_value_field = null
    state.id_group_field = null
    state.id_series_field = null
    state.id_date_field = null
    state.filters = []
  }
  const entity = props.entities.find(item => item.id_entity === entityId)
  if (!entity) {
    fields.value = []
    return
  }
  fieldsLoading.value = true
  try {
    const schema = await apiFetch<EntitySchema>(`/v1/schema/${entity.slug}`)
    fields.value = schema.fields
  } finally {
    fieldsLoading.value = false
  }
}, { immediate: true })

watch(() => state.widget_type, (type) => {
  if (type === 'kpi') {
    state.chart_type = null
    state.group_mode = null
    state.id_group_field = null
    state.id_series_field = null
  } else {
    state.chart_type ||= 'line'
    state.group_mode ||= 'time'
  }
})

watch(() => state.chart_type, (type) => {
  if (type === 'line' || type === 'area') state.group_mode = 'time'
  if (type === 'donut') {
    state.group_mode = 'category'
    state.id_series_field = null
  }
})

watch(() => state.date_source, (source) => {
  if (source !== 'field') state.id_date_field = null
  if (!source) state.comparison_enabled = false
})

watch(state, () => {
  validationError.value = null
}, { deep: true })

function filtersFor(field: Field): FilterCondition[] {
  return state.filters
    .filter(filter => filter.id_field === field.id_field)
    .map((filter, index) => ({
      id: `dashboard-filter-${field.id_field}-${index}`,
      column: field.column_name,
      operator: filter.operator as FilterCondition['operator'],
      value: filter.value
    }))
}

function updateFieldFilters(field: Field, conditions: FilterCondition[]) {
  state.filters = [
    ...state.filters.filter(filter => filter.id_field !== field.id_field),
    ...conditions.map(condition => ({
      id_field: field.id_field,
      operator: condition.operator,
      value: condition.value
    } satisfies DashboardFilter))
  ]
}

function addFilterField() {
  const field = fields.value.find(item => item.id_field === newFilterFieldId.value)
  if (!field || state.filters.some(filter => filter.id_field === field.id_field)) return
  state.filters.push({ id_field: field.id_field, operator: firstOperator(field), value: null })
  newFilterFieldId.value = ''
}

function firstOperator(field: Field) {
  if (field.ui_type === 'relation' || field.data_type === 'boolean') return 'eq'
  if (['integer', 'numeric', 'datetime'].includes(field.data_type)) return 'eq'
  return 'contains'
}

function removeFilterField(id: string) {
  state.filters = state.filters.filter(filter => filter.id_field !== id)
}

function submit() {
  validationError.value = validateWidget()
  if (validationError.value) return

  emit('save', structuredClone(toRaw(state)))
}

function validateWidget() {
  if (!state.title.trim()) return 'Completeaza titlul widget-ului.'
  if (!selectedEntity.value) return 'Selecteaza o entitate valida.'
  if (usesValueField.value && !state.id_value_field) return 'Selecteaza campul numeric folosit pentru agregare.'
  if (isChart.value && !state.chart_type) return 'Selecteaza tipul graficului.'
  if (isChart.value && !state.group_mode) return 'Selecteaza modul de grupare.'
  if (usesCategory.value && !state.id_group_field) return 'Selecteaza campul folosit pentru categorie.'
  if (usesTime.value && !state.date_source) return 'Selecteaza campul de data pentru gruparea temporala.'
  if (usesCustomDate.value && !state.id_date_field) return 'Selecteaza campul custom de data.'

  const incompleteFilter = state.filters.some(filter => {
    if (filter.operator === 'is_null') return typeof filter.value !== 'boolean'
    if (Array.isArray(filter.value)) return filter.value.length === 0
    return filter.value === null || filter.value === undefined || filter.value === ''
  })
  if (incompleteFilter) return 'Completeaza sau elimina filtrele fara valoare.'

  return null
}
</script>

<template>
  <div class="space-y-5">
    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField label="Titlu" required>
        <UInput v-model="state.title" class="w-full" placeholder="ex: Venit total" />
      </UFormField>
      <UFormField label="Tip widget" required>
        <USelect v-model="state.widget_type" :items="catalog.widgetTypes" value-key="value" class="w-full" />
      </UFormField>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField label="Subtitlu">
        <UInput v-model="state.subtitle" class="w-full" />
      </UFormField>
      <UFormField label="Icon">
        <UInput v-model="state.icon" class="w-full" placeholder="i-lucide-chart-line" />
      </UFormField>
    </div>

    <USeparator label="Sursa de date" />

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField label="Entitate" required>
        <USelect v-model="state.id_entity" :items="entityOptions" value-key="value" class="w-full" />
      </UFormField>
      <UFormField label="Agregare" required>
        <USelect v-model="state.aggregation" :items="catalog.aggregations" value-key="value" class="w-full" />
      </UFormField>
    </div>

    <UFormField v-if="usesValueField" label="Camp numeric" required>
      <USelect
        v-model="valueFieldModel"
        :items="fieldOptions(numericFields)"
        value-key="value"
        class="w-full"
        :loading="fieldsLoading"
      />
    </UFormField>

    <template v-if="isChart">
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="Tip grafic" required>
          <USelect v-model="chartTypeModel" :items="catalog.chartTypes" value-key="value" class="w-full" />
        </UFormField>
        <UFormField label="Grupare" required>
          <USelect
            v-model="groupModeModel"
            :items="catalog.groupModes"
            value-key="value"
            class="w-full"
            :disabled="state.chart_type === 'line' || state.chart_type === 'area' || state.chart_type === 'donut'"
          />
        </UFormField>
      </div>

      <UFormField v-if="usesCategory" label="Camp categorie" required>
        <USelect v-model="groupFieldModel" :items="fieldOptions(categoryFields)" value-key="value" class="w-full" />
      </UFormField>

      <UFormField v-if="state.chart_type !== 'donut'" label="Serie optionala">
        <USelect
          v-model="seriesFieldModel"
          :items="fieldOptions(categoryFields)"
          value-key="value"
          class="w-full"
          placeholder="O singura serie"
        />
      </UFormField>
    </template>

    <USeparator label="Perioada" />

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField label="Camp de data" :required="usesTime">
        <USelect
          v-model="state.date_source"
          :items="[
            { label: 'Fara filtru de perioada', value: null },
            { label: 'Data crearii', value: 'date_created' },
            { label: 'Data actualizarii', value: 'date_updated' },
            { label: 'Camp custom', value: 'field' }
          ]"
          value-key="value"
          class="w-full"
        />
      </UFormField>
      <UFormField v-if="isChart" label="Granularitate">
        <USelect v-model="state.date_granularity" :items="catalog.dateGranularities" value-key="value" class="w-full" />
      </UFormField>
    </div>

    <UFormField v-if="usesCustomDate" label="Camp custom de data" required>
      <USelect v-model="dateFieldModel" :items="fieldOptions(dateFields)" value-key="value" class="w-full" />
    </UFormField>

    <UFormField v-if="state.widget_type === 'kpi' && state.date_source" label="Comparatie cu perioada precedenta">
      <USwitch v-model="state.comparison_enabled" />
    </UFormField>

    <USeparator label="Filtre" />

    <div class="flex gap-2">
      <USelect
        v-model="newFilterFieldId"
        :items="fieldOptions(filterableFields)"
        value-key="value"
        placeholder="Adauga un camp filtrabil"
        class="flex-1"
      />
      <UButton icon="i-lucide-plus" color="neutral" variant="outline" :disabled="!newFilterFieldId" @click="addFilterField" />
    </div>

    <div class="space-y-2">
      <div
        v-for="field in filterableFields.filter(item => state.filters.some(filter => filter.id_field === item.id_field))"
        :key="field.id_field"
        class="flex items-center justify-between gap-3 rounded-lg border border-default p-3"
      >
        <span class="text-sm font-medium">{{ field.name }}</span>
        <div class="flex items-center gap-1">
          <DynamicColumnFilter
            :field="field"
            :model-value="filtersFor(field)"
            @update:model-value="conditions => updateFieldFilters(field, conditions)"
          />
          <UButton icon="i-lucide-x" color="error" variant="ghost" size="xs" @click="removeFilterField(field.id_field)" />
        </div>
      </div>
    </div>

    <USeparator label="Afisare" />

    <div class="grid gap-4 sm:grid-cols-3">
      <UFormField label="Latime">
        <USelect
          v-model="state.col_span"
          :items="catalog.layoutSpans.map(value => ({ label: `${value} / 12`, value }))"
          value-key="value"
          class="w-full"
        />
      </UFormField>
      <UFormField label="Format valoare">
        <USelect
          v-model="state.value_format"
          :items="[
            { label: 'Automat', value: 'auto' },
            { label: 'Numar', value: 'number' },
            { label: 'Moneda', value: 'currency' }
          ]"
          value-key="value"
          class="w-full"
        />
      </UFormField>
      <UFormField v-if="state.value_format === 'currency'" label="Moneda">
        <UInput v-model="state.currency_code" maxlength="3" class="w-full uppercase" />
      </UFormField>
    </div>

    <div class="grid gap-4 sm:grid-cols-3">
      <UFormField label="Drill-down"><USwitch v-model="state.drilldown_enabled" /></UFormField>
      <UFormField label="Activ"><USwitch v-model="state.is_active" /></UFormField>
      <UFormField v-if="usesCategory" label="Categorii maxime">
        <UInput v-model.number="state.top_n" type="number" :min="1" :max="25" />
      </UFormField>
    </div>

    <UAlert
      v-if="validationError"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Widget incomplet"
      :description="validationError"
    />

    <div class="flex justify-end gap-3 border-t border-default pt-4">
      <UButton label="Anuleaza" color="neutral" variant="outline" @click="emit('cancel')" />
      <UButton type="button" label="Aplica widget" icon="i-lucide-check" @click="submit" />
    </div>
  </div>
</template>
