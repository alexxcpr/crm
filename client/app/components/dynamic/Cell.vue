<script setup lang="ts">
import type { Field } from '~/types/schema'

defineProps<{
  value: any
  displayValue?: any
  field: Field
}>()

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(val)
}

function formatDate(val: string): string {
  try {
    return new Intl.DateTimeFormat('ro-RO').format(new Date(val))
  } catch {
    return val
  }
}

function formatTimestamp(val: string): string {
  try {
    return new Intl.DateTimeFormat('ro-RO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(val))
  } catch {
    return val
  }
}
</script>

<template>
  <span v-if="value === null || value === undefined || value === ''" class="text-muted">-</span>

  <UBadge
    v-else-if="field.ui_type === 'checkbox'"
    :color="value ? 'success' : 'warning'"
    variant="subtle"
    size="sm"
  >
    {{ value ? 'Da' : 'Nu' }}
  </UBadge>

  <a v-else-if="field.ui_type === 'email'" :href="`mailto:${value}`" class="text-primary hover:underline">
    {{ value }}
  </a>

  <a v-else-if="field.ui_type === 'phone'" :href="`tel:${value}`" class="text-primary hover:underline">
    {{ value }}
  </a>

  <span v-else-if="field.ui_type === 'currency'" class="text-highlighted">
    {{ formatCurrency(Number(value)) }}
  </span>

  <span v-else-if="field.ui_type === 'datetimepicker'" class="text-highlighted">
    {{ formatTimestamp(value) }}
  </span>

  <span v-else-if="field.ui_type === 'datepicker'" class="text-highlighted">
    {{ formatDate(value) }}
  </span>

  <NuxtLink
    v-else-if="field.ui_type === 'relation' && field.relation_entity_slug"
    :to="`/${field.relation_entity_slug}/${value}`"
    class="text-primary hover:underline"
  >
    {{ displayValue || value }}
  </NuxtLink>

  <span v-else class="text-highlighted">{{ value }}</span>
</template>
