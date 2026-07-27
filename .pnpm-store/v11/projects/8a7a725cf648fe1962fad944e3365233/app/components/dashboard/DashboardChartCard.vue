<script setup lang="ts">
import type { DashboardChartResult, DashboardWidget } from '~/types/dashboard'

defineProps<{
  widget: DashboardWidget
  result?: DashboardChartResult
  loading?: boolean
}>()
</script>

<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="font-semibold text-highlighted">{{ widget.title }}</h3>
          <p v-if="widget.subtitle" class="mt-1 text-sm text-muted">{{ widget.subtitle }}</p>
        </div>
        <UIcon v-if="widget.icon" :name="widget.icon" class="size-5 text-primary" />
      </div>
    </template>
    <div class="p-4 sm:p-6">
      <USkeleton v-if="loading" class="h-80 w-full" />
      <UAlert
        v-else-if="result?.error"
        color="error"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Grafic indisponibil"
        :description="result.error.message"
      />
      <UEmpty
        v-else-if="!result?.series?.some(series => series.points.length)"
        icon="i-lucide-chart-no-axes-column"
        title="Nu exista date pentru intervalul selectat"
      />
      <DashboardChart v-else :widget="widget" :result="result" />
    </div>
  </UCard>
</template>
