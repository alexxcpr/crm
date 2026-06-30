<script setup lang="ts">
import type { Field } from '~/types/schema'
import type { PlacedField } from '~/utils/formLayout'
import { computeFieldLayout } from '~/utils/formLayout'

const props = defineProps<{
  fields: Field[]
  formState: Record<string, any>
  autofocusFirst?: boolean
}>()

const emit = defineEmits<{
  updateField: [payload: { slug: string, value: any }]
}>()

const MIN_COLUMN_WIDTH = 280
const gridContainer = ref<HTMLElement>()
const containerWidth = ref(0)
const measured = ref(false)

onMounted(() => {
  const el = gridContainer.value
  if (!el) return

  const observer = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width ?? 0
    if (width > 0) {
      containerWidth.value = width
      measured.value = true
    }
  })
  observer.observe(el)
  onUnmounted(() => observer.disconnect())
})

const availableColumns = computed(() => {
  if (!measured.value) return 3
  const cols = Math.floor(containerWidth.value / MIN_COLUMN_WIDTH)
  return Math.max(1, Math.min(cols, 3))
})

const layout = computed(() => computeFieldLayout(props.fields, availableColumns.value))

function getDesktopStyle(placedField: PlacedField) {
  return {
    gridColumn: `${placedField.colStart} / span ${placedField.colSpan}`,
    gridRow: `${placedField.rowStart}`
  }
}

function updateField(slug: string, value: any) {
  emit('updateField', { slug, value })
}
</script>

<template>
  <div class="space-y-4">
    <!-- Mobile: stack vertical -->
    <div class="flex flex-col gap-3 md:hidden">
      <DynamicField
        v-for="(placedField, idx) in layout.placed"
        :key="placedField.field.id_field"
        :field="placedField.field"
        :model-value="formState[placedField.field.slug]"
        :autofocus="autofocusFirst && idx === 0"
        @update:model-value="updateField(placedField.field.slug, $event)"
      />
    </div>

    <!-- Desktop: grid fluid -->
    <div
      ref="gridContainer"
      class="hidden md:grid md:gap-x-4 md:gap-y-4"
      :style="{ gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))` }"
    >
      <div
        v-for="(placedField, idx) in layout.placed"
        :key="placedField.field.id_field"
        :style="getDesktopStyle(placedField)"
      >
        <DynamicField
          :field="placedField.field"
          :model-value="formState[placedField.field.slug]"
          :autofocus="autofocusFirst && idx === 0"
          @update:model-value="updateField(placedField.field.slug, $event)"
        />
      </div>
    </div>
  </div>
</template>
