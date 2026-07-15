<script setup lang="ts">
import {
  VisArea,
  VisAxis,
  VisCrosshair,
  VisDonut,
  VisDonutSelectors,
  VisGroupedBar,
  VisGroupedBarSelectors,
  VisLine,
  VisSingleContainer,
  VisTooltip,
  VisXYContainer
} from '@unovis/vue'
import type { DashboardChartPoint, DashboardChartResult, DashboardWidget } from '~/types/dashboard'
import { dashboardDrilldownRoute } from '~/utils/dashboardDrilldown'

const props = defineProps<{
  widget: DashboardWidget
  result: DashboardChartResult
}>()

type ChartRow = {
  key: string
  label: string
  values: number[]
  points: (DashboardChartPoint | undefined)[]
}

const cardRef = useTemplateRef<HTMLElement | null>('cardRef')
const { width } = useElementSize(cardRef)
// Keep every chart in sync with the primary color selected in Theme.
// Extra series/categories use adaptive shades of the same theme color.
const primaryPalette = [
  'var(--ui-primary)',
  'color-mix(in oklab, var(--ui-primary) 82%, var(--ui-bg))',
  'color-mix(in oklab, var(--ui-primary) 82%, var(--ui-text))',
  'color-mix(in oklab, var(--ui-primary) 64%, var(--ui-bg))',
  'color-mix(in oklab, var(--ui-primary) 64%, var(--ui-text))',
  'color-mix(in oklab, var(--ui-primary) 46%, var(--ui-bg))',
  'color-mix(in oklab, var(--ui-primary) 46%, var(--ui-text))',
  'color-mix(in oklab, var(--ui-primary) 30%, var(--ui-bg))'
]
const dateFormatter = new Intl.DateTimeFormat('ro-RO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
})
const dateTimeFormatter = new Intl.DateTimeFormat('ro-RO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
})
const valueFormatter = computed(() => new Intl.NumberFormat('ro-RO', props.widget.value_format === 'currency'
  ? { style: 'currency', currency: props.widget.currency_code || 'RON', maximumFractionDigits: 2 }
  : { maximumFractionDigits: 2 }))

function seriesLabel(series: DashboardChartResult['series'][number]) {
  return series.key === '__value__' ? props.widget.title : series.label
}

function pointLabel(key: string, fallback: string, includeTime = false) {
  if (!props.result.effectiveGranularity) return fallback
  const date = new Date(key)
  if (Number.isNaN(date.getTime())) return fallback
  return (includeTime ? dateTimeFormatter : dateFormatter).format(date).replace(',', '')
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function formatValue(value: number) {
  return valueFormatter.value.format(value)
}

const rows = computed<ChartRow[]>(() => {
  const keys: string[] = []
  const labels = new Map<string, string>()
  for (const series of props.result.series) {
    for (const point of series.points) {
      if (!keys.includes(point.key)) keys.push(point.key)
      labels.set(point.key, pointLabel(point.key, point.label))
    }
  }
  return keys.map(key => ({
    key,
    label: labels.get(key) ?? key,
    values: props.result.series.map(series => series.points.find(point => point.key === key)?.value ?? 0),
    points: props.result.series.map(series => series.points.find(point => point.key === key))
  }))
})

const donutData = computed(() => props.result.series[0]?.points ?? [])
const x = (_: ChartRow, index: number) => index
const y = computed(() => props.result.series.map((_, seriesIndex) => (row: ChartRow) => row.values[seriesIndex] ?? 0))
const colors = computed(() => props.result.series.map((_, index) => primaryPalette[index % primaryPalette.length]))
const donutEvents = computed(() => ({
  [VisDonutSelectors.segment]: {
    click: (arc: { data: DashboardChartPoint }) => openPoint(arc.data)
  }
}))
const donutTooltipTriggers = computed(() => ({
  [VisDonutSelectors.segment]: (arc: { data: DashboardChartPoint }) => {
    const total = donutData.value.reduce((sum, point) => sum + point.value, 0)
    const percent = total ? ` (${new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 }).format(arc.data.value / total * 100)}%)` : ''
    return `<strong>${escapeHtml(arc.data.label)}</strong><br>${formatValue(arc.data.value)}${percent}`
  }
}))
const barEvents = computed(() => ({
  [VisGroupedBarSelectors.bar]: {
    click: (row: ChartRow, _event: MouseEvent, seriesIndex: number) => openPoint(row.points[seriesIndex])
  }
}))
const drilldownPoints = computed(() => props.result.series.flatMap(series => series.points
  .filter(point => point.drilldown)
  .map(point => ({
    key: `${series.key}-${point.key}`,
    label: props.result.series.length > 1
      ? `${pointLabel(point.key, point.label, true)} - ${seriesLabel(series)}`
      : pointLabel(point.key, point.label, true),
    point
  }))))
const xTick = (index: number) => rows.value[index]?.label ?? ''
const tooltip = (row: ChartRow) => [
  `<strong>${escapeHtml(row.label)}</strong>`,
  ...props.result.series.map((series, index) => `${escapeHtml(seriesLabel(series))}: ${formatValue(row.values[index] ?? 0)}`)
].join('<br>')

function openPoint(point?: DashboardChartPoint) {
  if (point?.drilldown) navigateTo(dashboardDrilldownRoute(point.drilldown))
}
</script>

<template>
  <div ref="cardRef">
    <VisSingleContainer v-if="result.chartType === 'donut'" :data="donutData" class="h-80">
      <VisDonut
        :value="(point: DashboardChartPoint) => point.value"
        :color="(_: DashboardChartPoint, index: number) => primaryPalette[index % primaryPalette.length]"
        :central-label="formatValue(donutData.reduce((total, point) => total + point.value, 0))"
        central-sub-label="Total"
        :arc-width="32"
        :events="donutEvents"
        cursor="pointer"
      />
      <VisTooltip :triggers="donutTooltipTriggers" />
    </VisSingleContainer>

    <VisXYContainer
      v-else
      :data="rows"
      :width="width"
      :padding="{ top: 24, right: 12 }"
      class="h-80"
    >
      <VisLine
        v-if="result.chartType === 'line'"
        :x="x"
        :y="y"
        :color="colors"
        :line-width="3"
        cursor="pointer"
      />
      <VisArea
        v-else-if="result.chartType === 'area'"
        :x="x"
        :y="y"
        :color="colors"
        :opacity="0.25"
      />
      <VisGroupedBar
        v-else
        :x="x"
        :y="y"
        :color="(_: ChartRow, index: number) => primaryPalette[index % primaryPalette.length]"
        :rounded-corners="4"
        :events="barEvents"
        cursor="pointer"
      />
      <VisAxis type="x" :x="x" :tick-format="xTick" />
      <VisAxis type="y" />
      <VisCrosshair :template="tooltip" color="var(--ui-primary)" />
      <VisTooltip />
    </VisXYContainer>

    <div v-if="result.series.length > 1" class="mt-3 flex flex-wrap gap-3 text-xs text-muted">
      <span v-for="(series, index) in result.series" :key="series.key" class="flex items-center gap-1.5">
        <span class="size-2.5 rounded-full" :style="{ backgroundColor: primaryPalette[index % primaryPalette.length] }" />
        {{ seriesLabel(series) }}
      </span>
    </div>

    <div class="mt-3 flex max-h-20 flex-wrap gap-1 overflow-y-auto">
      <UButton
        v-for="item in drilldownPoints"
        :key="item.key"
        :label="item.label"
        color="neutral"
        variant="ghost"
        size="xs"
        @click="openPoint(item.point)"
      />
    </div>
  </div>
</template>

<style scoped>
.unovis-xy-container,
.unovis-single-container {
  --vis-axis-grid-color: var(--ui-border);
  --vis-axis-tick-color: var(--ui-border);
  --vis-axis-tick-label-color: var(--ui-text-dimmed);
  --vis-tooltip-background-color: var(--ui-bg);
  --vis-tooltip-border-color: var(--ui-border);
  --vis-tooltip-text-color: var(--ui-text-highlighted);
}
</style>
