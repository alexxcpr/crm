<script setup lang="ts">
import type { DashboardKpiResult, DashboardWidget } from '~/types/dashboard'
import { dashboardDrilldownRoute } from '~/utils/dashboardDrilldown'

const props = defineProps<{
  widget: DashboardWidget
  result?: DashboardKpiResult
  loading?: boolean
}>()

const formatter = computed(() => {
  const options: Intl.NumberFormatOptions = props.widget.value_format === 'currency'
    ? { style: 'currency', currency: props.widget.currency_code || 'RON', maximumFractionDigits: 2 }
    : { maximumFractionDigits: 2 }
  return new Intl.NumberFormat('ro-RO', options)
})

function openDrilldown() {
  if (props.result?.drilldown) navigateTo(dashboardDrilldownRoute(props.result.drilldown))
}
</script>

<template>
  <UCard
    :class="result?.drilldown ? 'cursor-pointer transition hover:ring-primary/40' : ''"
    @click="openDrilldown"
  >
    <div v-if="loading" class="space-y-3">
      <USkeleton class="h-4 w-28" />
      <USkeleton class="h-9 w-36" />
    </div>
    <UAlert
      v-else-if="result?.error"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="widget.title"
      :description="result.error.message"
    />
    <div v-else class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="truncate text-xs font-medium uppercase tracking-wide text-muted">
          {{ widget.title }}
        </p>
        <p class="mt-2 text-3xl font-semibold text-highlighted">
          {{ formatter.format(result?.value ?? 0) }}
        </p>
        <p v-if="widget.subtitle" class="mt-1 truncate text-xs text-muted">
          {{ widget.subtitle }}
        </p>
      </div>
      <div class="flex flex-col items-end gap-3">
        <div v-if="widget.icon" class="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UIcon :name="widget.icon" class="size-5" />
        </div>
        <UBadge
          v-if="result?.previousValue !== null && result?.previousValue !== undefined"
          :color="result.isNew || (result.changePercent ?? 0) >= 0 ? 'success' : 'error'"
          variant="subtle"
        >
          <template v-if="result.isNew">Nou</template>
          <template v-else>{{ (result.changePercent ?? 0) > 0 ? '+' : '' }}{{ (result.changePercent ?? 0).toFixed(1) }}%</template>
        </UBadge>
      </div>
    </div>
  </UCard>
</template>
