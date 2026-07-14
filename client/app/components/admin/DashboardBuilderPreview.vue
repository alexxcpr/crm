<script setup lang="ts">
import type { DashboardDefinition } from '~/types/dashboard'

defineProps<{
  dashboard: DashboardDefinition
}>()
</script>

<template>
  <div class="space-y-6 rounded-xl bg-default p-4 sm:p-6">
    <div>
      <div class="flex items-center gap-2">
        <UIcon :name="dashboard.icon || 'i-lucide-layout-dashboard'" class="size-6 text-primary" />
        <h2 class="text-xl font-semibold">{{ dashboard.name || 'Dashboard fara nume' }}</h2>
      </div>
      <p v-if="dashboard.description" class="mt-1 text-sm text-muted">{{ dashboard.description }}</p>
      <p class="mt-2 text-xs text-muted">Previzualizare de layout. Valorile reale apar dupa salvare.</p>
    </div>

    <section v-for="(block, blockIndex) in dashboard.blocks.filter(item => item.is_active)" :key="block.id_ui_block ?? blockIndex" class="space-y-3">
      <div>
        <h3 class="font-semibold">{{ block.title || 'Sectiune fara titlu' }}</h3>
        <p v-if="block.subtitle" class="text-sm text-muted">{{ block.subtitle }}</p>
      </div>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <UCard
          v-for="(widget, widgetIndex) in block.widgets.filter(item => item.is_active)"
          :key="widget.id_ui_widget ?? widgetIndex"
          class="dashboard-preview-widget"
          :style="{ '--preview-span': String(widget.col_span) }"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="font-medium">{{ widget.title || 'Widget fara titlu' }}</p>
              <p v-if="widget.subtitle" class="text-xs text-muted">{{ widget.subtitle }}</p>
            </div>
            <UIcon :name="widget.icon || 'i-lucide-chart-no-axes-column'" class="size-5 text-primary" />
          </div>

          <div v-if="widget.widget_type === 'kpi'" class="mt-5">
            <div class="text-3xl font-semibold text-highlighted">--</div>
            <div v-if="widget.comparison_enabled" class="mt-2 h-4 w-24 rounded bg-elevated" />
          </div>

          <div v-else-if="widget.chart_type === 'donut'" class="mx-auto mt-5 size-32 rounded-full bg-[conic-gradient(var(--ui-primary)_0_42%,var(--ui-color-info-500)_42%_72%,var(--ui-bg-elevated)_72%)] p-7">
            <div class="size-full rounded-full bg-default" />
          </div>

          <div v-else-if="widget.chart_type === 'bar'" class="mt-5 flex h-32 items-end gap-2 border-b border-l border-default px-3">
            <span v-for="height in [35, 62, 48, 86, 70, 94]" :key="height" class="flex-1 rounded-t bg-primary/70" :style="{ height: `${height}%` }" />
          </div>

          <svg v-else class="mt-5 h-32 w-full" viewBox="0 0 300 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline points="0,82 48,54 92,66 142,24 192,38 240,18 300,48" fill="none" stroke="var(--ui-primary)" stroke-width="4" vector-effect="non-scaling-stroke" />
          </svg>
        </UCard>
      </div>
    </section>

    <UEmpty
      v-if="!dashboard.blocks.some(block => block.is_active && block.widgets.some(widget => widget.is_active))"
      icon="i-lucide-layout-dashboard"
      title="Dashboard gol"
      description="Adauga cel putin un widget activ pentru a vedea layout-ul."
    />
  </div>
</template>

<style scoped>
.dashboard-preview-widget {
  grid-column: 1 / -1;
}

@media (min-width: 64rem) {
  .dashboard-preview-widget {
    grid-column: span var(--preview-span) / span var(--preview-span);
  }
}
</style>
