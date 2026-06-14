<script setup lang="ts">
import type { Field } from '~/types/schema'
import type { ColumnFilters, FilterCondition } from '~/types/filters'
import { summarizeFilterConditions } from '~/utils/filterOperators'

const props = defineProps<{
  fields: Field[]
  modelValue: ColumnFilters
}>()

const emit = defineEmits<{
  'update:modelValue': [filters: ColumnFilters]
}>()

const { getRelationOptionLabel } = useRelationOptionsCache()

function updateFieldFilter(field: Field, conditions: FilterCondition[]) {
  emit('update:modelValue', {
    ...props.modelValue,
    [field.column_name]: conditions
  })
}

function getFilterSummary(field: Field): string {
  return summarizeFilterConditions(props.modelValue[field.column_name] ?? [], field, {
    resolveValueLabel: (_field, value) => getRelationOptionLabel(field, value)
  })
}
</script>

<template>
  <div v-if="fields.length > 0" class="flex w-full flex-wrap items-center gap-1.5">
    <span class="mr-1 text-xs font-medium uppercase tracking-wide text-muted">
      Filtre rapide
    </span>

    <div
      v-for="field in fields"
      :key="field.id_field"
      :class="[
        'flex items-center gap-1 rounded-full border bg-white px-2 py-1 shadow-xs dark:bg-gray-900',
        getFilterSummary(field)
          ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/15'
          : 'border-default'
      ]"
    >
      <span class="max-w-32 truncate text-xs font-medium text-highlighted">
        {{ field.name }}
      </span>
      <UBadge
        v-if="getFilterSummary(field)"
        color="primary"
        variant="subtle"
        size="sm"
        class="max-w-48 truncate rounded-full normal-case"
      >
        {{ getFilterSummary(field) }}
      </UBadge>
      <DynamicColumnFilter
        :field="field"
        :model-value="modelValue[field.column_name] ?? []"
        @update:model-value="(conditions) => updateFieldFilter(field, conditions)"
      />
    </div>
  </div>
</template>
