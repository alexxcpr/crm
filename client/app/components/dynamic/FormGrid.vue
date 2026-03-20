<script setup lang="ts">
import type { Field } from '~/types/schema'

const props = defineProps<{
  fields: Field[]
  formState: Record<string, any>
}>()

function getColumnFields(col: number): Field[] {
  return props.fields
    .filter(f => f.grid_col === col && f.col_span === 1)
    .sort((a, b) => a.rank - b.rank)
}

const fullWidthFields = computed(() =>
  props.fields
    .filter(f => f.col_span > 1)
    .sort((a, b) => a.rank - b.rank)
)

const col1 = computed(() => getColumnFields(1))
const col2 = computed(() => getColumnFields(2))
const col3 = computed(() => getColumnFields(3))

const hasMultipleColumns = computed(() =>
  col2.value.length > 0 || col3.value.length > 0
)

function getColSpanClass(field: Field): string {
  if (field.col_span === 3) return 'col-span-1 md:col-span-3'
  if (field.col_span === 2) return 'col-span-1 md:col-span-2'
  return ''
}
</script>

<template>
  <div class="space-y-4">
    <!-- Grid cu 3 coloane pentru campurile single-column -->
    <div v-if="hasMultipleColumns" class="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
      <!-- Coloana 1 -->
      <div v-if="col1.length" class="space-y-4">
        <DynamicField
          v-for="field in col1"
          :key="field.id_field"
          :field="field"
          :model-value="formState[field.slug]"
          @update:model-value="formState[field.slug] = $event"
        />
      </div>

      <!-- Coloana 2 -->
      <div v-if="col2.length" class="space-y-4">
        <DynamicField
          v-for="field in col2"
          :key="field.id_field"
          :field="field"
          :model-value="formState[field.slug]"
          @update:model-value="formState[field.slug] = $event"
        />
      </div>

      <!-- Coloana 3 -->
      <div v-if="col3.length" class="space-y-4">
        <DynamicField
          v-for="field in col3"
          :key="field.id_field"
          :field="field"
          :model-value="formState[field.slug]"
          @update:model-value="formState[field.slug] = $event"
        />
      </div>
    </div>

    <!-- Fallback: toate pe coloana 1 (fara grid_col setat) -->
    <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
      <DynamicField
        v-for="field in fields.filter(f => f.col_span === 1)"
        :key="field.id_field"
        :field="field"
        :model-value="formState[field.slug]"
        @update:model-value="formState[field.slug] = $event"
      />
    </div>

    <!-- Campuri full-width (col_span > 1) -->
    <div v-if="fullWidthFields.length" class="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
      <div
        v-for="field in fullWidthFields"
        :key="field.id_field"
        :class="getColSpanClass(field)"
      >
        <DynamicField
          :field="field"
          :model-value="formState[field.slug]"
          @update:model-value="formState[field.slug] = $event"
        />
      </div>
    </div>
  </div>
</template>
