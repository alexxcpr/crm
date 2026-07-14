<script setup lang="ts">
import { useSortable } from '@vueuse/integrations/useSortable'
import type { AdminEntity } from '~/types/admin'
import type { DashboardBlock, DashboardCatalog, DashboardWidget } from '~/types/dashboard'

const props = defineProps<{
  modelValue: DashboardBlock
  entities: AdminEntity[]
  catalog: DashboardCatalog
}>()

const emit = defineEmits<{
  'update:modelValue': [block: DashboardBlock]
  remove: []
}>()

const widgetsRoot = useTemplateRef<HTMLElement | null>('widgetsRoot')
const widgets = computed({
  get: () => props.modelValue.widgets,
  set: value => emit('update:modelValue', { ...props.modelValue, widgets: value.map((widget, rank) => ({ ...widget, rank })) })
})

useSortable(widgetsRoot, widgets, {
  handle: '.widget-drag-handle',
  animation: 160
})

const showWidgetModal = ref(false)
const editingIndex = ref<number | null>(null)

function updateBlock(patch: Partial<DashboardBlock>) {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}

function newWidget(): DashboardWidget {
  return {
    id_entity: props.entities[0]?.id_entity ?? '',
    widget_type: 'kpi',
    chart_type: null,
    title: '',
    subtitle: null,
    icon: 'i-lucide-chart-no-axes-column',
    aggregation: 'count',
    id_value_field: null,
    group_mode: null,
    id_group_field: null,
    id_series_field: null,
    date_source: 'date_created',
    id_date_field: null,
    date_granularity: 'auto',
    filters: [],
    comparison_enabled: false,
    value_format: 'auto',
    currency_code: 'RON',
    top_n: 12,
    col_span: 4,
    rank: props.modelValue.widgets.length,
    drilldown_enabled: true,
    is_active: true
  }
}

const editingWidget = computed(() => editingIndex.value === null ? newWidget() : props.modelValue.widgets[editingIndex.value]!)

function addWidget() {
  editingIndex.value = null
  showWidgetModal.value = true
}

function editWidget(index: number) {
  editingIndex.value = index
  showWidgetModal.value = true
}

function saveWidget(widget: DashboardWidget) {
  const next = [...props.modelValue.widgets]
  if (editingIndex.value === null) next.push(widget)
  else next[editingIndex.value] = widget
  widgets.value = next
  showWidgetModal.value = false
}

function removeWidget(index: number) {
  widgets.value = props.modelValue.widgets.filter((_, itemIndex) => itemIndex !== index)
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-start gap-3">
        <UButton class="block-drag-handle cursor-grab" icon="i-lucide-grip-vertical" color="neutral" variant="ghost" />
        <div class="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
          <UInput :model-value="modelValue.title" placeholder="Titlul blocului" @update:model-value="value => updateBlock({ title: String(value) })" />
          <UInput :model-value="modelValue.subtitle" placeholder="Subtitlu optional" @update:model-value="value => updateBlock({ subtitle: String(value) || null })" />
        </div>
        <USwitch :model-value="modelValue.is_active" @update:model-value="value => updateBlock({ is_active: value })" />
        <UButton icon="i-lucide-trash-2" color="error" variant="ghost" @click="emit('remove')" />
      </div>
    </template>

    <div ref="widgetsRoot" class="grid grid-cols-1 gap-3 lg:grid-cols-12">
      <div
        v-for="(widget, index) in modelValue.widgets"
        :key="widget.id_ui_widget ?? `${widget.title}-${index}`"
        class="dashboard-builder-widget rounded-xl border border-default bg-elevated/30 p-4"
        :style="{ '--widget-span': String(widget.col_span) }"
      >
        <div class="flex items-start gap-3">
          <UButton class="widget-drag-handle cursor-grab" icon="i-lucide-grip-vertical" color="neutral" variant="ghost" size="xs" />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="truncate font-medium">{{ widget.title || 'Widget fara titlu' }}</span>
              <UBadge :label="widget.widget_type === 'kpi' ? 'KPI' : widget.chart_type ?? 'Chart'" color="neutral" variant="subtle" />
            </div>
            <p class="mt-1 truncate text-xs text-muted">
              {{ widget.entity_label ?? widget.entity_name ?? entities.find(entity => entity.id_entity === widget.id_entity)?.name }} - {{ widget.aggregation }}
            </p>
          </div>
          <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="xs" @click="editWidget(index)" />
          <UButton icon="i-lucide-x" color="error" variant="ghost" size="xs" @click="removeWidget(index)" />
        </div>
      </div>
    </div>

    <UButton class="mt-4" label="Adauga widget" icon="i-lucide-plus" color="neutral" variant="outline" @click="addWidget" />

    <UModal v-model:open="showWidgetModal" :title="editingIndex === null ? 'Widget nou' : 'Editeaza widget'" :ui="{ content: 'sm:max-w-4xl' }">
      <template #body>
        <AdminDashboardWidgetForm
          :key="`${editingIndex ?? 'new'}-${editingWidget.id_ui_widget ?? ''}`"
          :widget="editingWidget"
          :entities="entities"
          :catalog="catalog"
          @save="saveWidget"
          @cancel="showWidgetModal = false"
        />
      </template>
    </UModal>
  </UCard>
</template>

<style scoped>
.dashboard-builder-widget {
  grid-column: 1 / -1;
}

@media (min-width: 64rem) {
  .dashboard-builder-widget {
    grid-column: span var(--widget-span) / span var(--widget-span);
  }
}
</style>
