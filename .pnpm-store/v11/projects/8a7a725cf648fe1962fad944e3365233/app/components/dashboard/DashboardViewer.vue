<script setup lang="ts">
import type { Range } from '~/types'
import type { DashboardChartResult, DashboardKpiResult, DashboardWidget } from '~/types/dashboard'

const props = defineProps<{
  slug?: string
}>()

const {
  dashboard,
  resultsByWidget,
  loading,
  querying,
  error,
  fetchDashboard,
  queryDashboard
} = useDashboardData()

const range = shallowRef<Range>({
  start: new Date(Date.now() - 29 * 86_400_000),
  end: new Date()
})

function applyPreset(preset?: string) {
  const end = new Date()
  const start = new Date(end)
  start.setHours(0, 0, 0, 0)
  if (preset === 'today') {
    // start already points to today
  } else if (preset === 'last_7_days') {
    start.setDate(start.getDate() - 6)
  } else if (preset === 'this_month') {
    start.setDate(1)
  } else {
    start.setDate(start.getDate() - 29)
  }
  range.value = { start, end }
}

function exclusiveEnd(date: Date) {
  const end = new Date(date)
  end.setHours(0, 0, 0, 0)
  end.setDate(end.getDate() + 1)
  return end
}

async function load() {
  const definition = await fetchDashboard(props.slug)
  if (!definition) return
  applyPreset(definition.default_date_preset)
  await refresh()
}

async function refresh() {
  await queryDashboard(range.value.start, exclusiveEnd(range.value.end))
}

function widgetStyle(widget: DashboardWidget) {
  return { '--widget-span': String(widget.col_span) }
}

function kpiResult(id?: string) {
  const result = id ? resultsByWidget.value.get(id) : undefined
  return result?.kind === 'kpi' ? result as DashboardKpiResult : undefined
}

function chartResult(id?: string) {
  const result = id ? resultsByWidget.value.get(id) : undefined
  return result?.kind === 'chart' ? result as DashboardChartResult : undefined
}

watch(() => props.slug, load, { immediate: true })
watch(range, () => refresh(), { deep: true })
</script>

<template>
  <UDashboardPanel :id="slug ? `dashboard-${slug}` : 'home-dashboard'" :ui="{ body: 'p-3 sm:p-5' }">
    <template #header>
      <UDashboardNavbar :title="dashboard?.name ?? 'Dashboard'">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="querying"
            @click="refresh"
          />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <template #left>
          <HomeDateRangePicker v-model="range" class="-ms-1" />
        </template>
        <template #right>
          <span v-if="dashboard?.description" class="hidden max-w-xl truncate text-sm text-muted md:block">
            {{ dashboard.description }}
          </span>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div v-if="loading" class="space-y-5">
        <USkeleton class="h-8 w-56" />
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <USkeleton v-for="index in 4" :key="index" class="h-36 lg:col-span-3" />
        </div>
        <USkeleton class="h-96" />
      </div>

      <UAlert
        v-else-if="error && !dashboard"
        color="error"
        variant="subtle"
        icon="i-lucide-layout-dashboard"
        title="Dashboard indisponibil"
        :description="error"
      />

      <UEmpty
        v-else-if="dashboard && !dashboard.blocks.length"
        icon="i-lucide-layout-dashboard"
        title="Dashboard-ul nu contine widget-uri vizibile"
        description="Un administrator poate adauga blocuri si widget-uri din zona de administrare."
      />

      <div v-else class="space-y-7">
        <section v-for="block in dashboard?.blocks" :key="block.id_ui_block ?? block.rank" class="space-y-4">
          <div>
            <h2 class="text-lg font-semibold text-highlighted">{{ block.title }}</h2>
            <p v-if="block.subtitle" class="text-sm text-muted">{{ block.subtitle }}</p>
          </div>
          <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div
              v-for="widget in block.widgets"
              :key="widget.id_ui_widget"
              class="dashboard-widget"
              :style="widgetStyle(widget)"
            >
              <DashboardKpi
                v-if="widget.widget_type === 'kpi'"
                :widget="widget"
                :result="kpiResult(widget.id_ui_widget)"
                :loading="querying && !kpiResult(widget.id_ui_widget)"
              />
              <DashboardChartCard
                v-else
                :widget="widget"
                :result="chartResult(widget.id_ui_widget)"
                :loading="querying && !chartResult(widget.id_ui_widget)"
              />
            </div>
          </div>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.dashboard-widget {
  grid-column: 1 / -1;
}

@media (min-width: 64rem) {
  .dashboard-widget {
    grid-column: span var(--widget-span) / span var(--widget-span);
  }
}
</style>
