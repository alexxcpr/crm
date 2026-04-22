<script setup lang="ts">
import type { Field } from '~/types/schema'
import type { PlacedField } from '~/utils/formLayout'
import { computeFieldLayout } from '~/utils/formLayout'

const props = defineProps<{
  fields: Field[]
  formState: Record<string, any>
}>()

const placedFields = computed(() => computeFieldLayout(props.fields))

function getDesktopStyle(placedField: PlacedField) {
  return {
    gridColumn: `${placedField.colStart} / span ${placedField.colSpan}`,
    gridRow: `${placedField.rowStart}`
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col gap-4 md:hidden">
      <DynamicField
        v-for="placedField in placedFields"
        :key="placedField.field.id_field"
        :field="placedField.field"
        :model-value="formState[placedField.field.slug]"
        @update:model-value="formState[placedField.field.slug] = $event"
      />
    </div>

    <div class="hidden md:grid md:grid-cols-3 md:gap-x-8 md:gap-y-6">
      <div
        v-for="placedField in placedFields"
        :key="placedField.field.id_field"
        :style="getDesktopStyle(placedField)"
      >
        <DynamicField
          :field="placedField.field"
          :model-value="formState[placedField.field.slug]"
          @update:model-value="formState[placedField.field.slug] = $event"
        />
      </div>
    </div>
  </div>
</template>
