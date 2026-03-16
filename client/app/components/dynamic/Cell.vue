<script setup lang="ts">
import type { Field } from '~/types/schema'

defineProps<{
  value: any
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

function getOptionLabel(options: { label: string; value: string }[] | null, val: string): string {
  return options?.find(o => o.value === val)?.label ?? val
}
</script>

<template>
  <span v-if="value === null || value === undefined || value === ''" class="text-muted">-</span>

  <UBadge v-else-if="field.ui_type === 'checkbox'" :color="value ? 'success' : 'warning'" variant="subtle">
    {{ value ? 'Da' : 'Nu' }}
  </UBadge>

  <UBadge v-else-if="field.ui_type === 'select'" color="neutral" variant="subtle">
    {{ getOptionLabel(field.options, value) }}
  </UBadge>

  <a v-else-if="field.ui_type === 'email'" :href="`mailto:${value}`" class="text-primary hover:underline">
    {{ value }}
  </a>

  <a v-else-if="field.ui_type === 'phone'" :href="`tel:${value}`" class="text-primary hover:underline">
    {{ value }}
  </a>

  <span v-else-if="field.ui_type === 'currency'">
    {{ formatCurrency(Number(value)) }}
  </span>

  <span v-else-if="field.ui_type === 'datepicker' && field.data_type === 'timestamp'">
    {{ formatTimestamp(value) }}
  </span>

  <span v-else-if="field.ui_type === 'datepicker'">
    {{ formatDate(value) }}
  </span>

  <NuxtLink
    v-else-if="field.ui_type === 'relation' && field.relation_entity_slug"
    :to="`/${field.relation_entity_slug}/${value}`"
    class="text-primary hover:underline"
  >
    {{ value }}
  </NuxtLink>

  <span v-else>{{ value }}</span>
</template>