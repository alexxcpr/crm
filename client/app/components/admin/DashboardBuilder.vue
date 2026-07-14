<script setup lang="ts">
import { useSortable } from '@vueuse/integrations/useSortable'
import type { DashboardBlock, DashboardDefinition } from '~/types/dashboard'

const props = defineProps<{
  dashboardId?: string
}>()

const { catalog, loading, error, fetchCatalog, fetchDashboard, saveDashboard } = useAdminDashboards()
const { entities, fetchEntities } = useAdminEntities()
const toast = useToast()
const blocksRoot = useTemplateRef<HTMLElement | null>('blocksRoot')
const slugManuallyEdited = ref(Boolean(props.dashboardId))
const showPreview = ref(false)

const state = ref<DashboardDefinition>({
  name: '',
  slug: '',
  description: null,
  icon: 'i-lucide-layout-dashboard',
  default_date_preset: 'last_30_days',
  is_default: false,
  is_active: true,
  rank: 0,
  blocks: []
})

const blocks = computed({
  get: () => state.value.blocks,
  set: value => { state.value.blocks = value.map((block, rank) => ({ ...block, rank })) }
})

useSortable(blocksRoot, blocks, {
  handle: '.block-drag-handle',
  animation: 180
})

await Promise.all([fetchCatalog(), fetchEntities()])
if (props.dashboardId) {
  const existing = await fetchDashboard(props.dashboardId)
  if (existing) state.value = structuredClone(existing)
}

watch(() => state.value.name, (name) => {
  if (slugManuallyEdited.value) return
  state.value.slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
})

function addBlock() {
  state.value.blocks.push({
    title: `Sectiune ${state.value.blocks.length + 1}`,
    subtitle: null,
    rank: state.value.blocks.length,
    is_active: true,
    widgets: []
  })
}

function updateBlock(index: number, block: DashboardBlock) {
  state.value.blocks[index] = block
}

function removeBlock(index: number) {
  state.value.blocks.splice(index, 1)
  state.value.blocks.forEach((block, rank) => { block.rank = rank })
}

async function save() {
  const saved = await saveDashboard(state.value)
  if (!saved) {
    toast.add({ title: 'Dashboard-ul nu a fost salvat', description: error.value ?? '', color: 'error' })
    return
  }
  state.value = structuredClone(saved)
  toast.add({ title: 'Dashboard salvat', color: 'success' })
  if (!props.dashboardId) await navigateTo(`/admin/dashboards/${saved.id_ui_dashboard}`)
}
</script>

<template>
  <div v-if="catalog" class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 class="text-lg font-semibold">{{ dashboardId ? 'Editeaza dashboard' : 'Dashboard nou' }}</h2>
        <p class="text-sm text-muted">Modificarile devin vizibile numai dupa salvarea completa.</p>
      </div>
      <div class="flex gap-2">
        <UButton label="Inapoi" icon="i-lucide-arrow-left" color="neutral" variant="outline" to="/admin/dashboards" />
        <UButton label="Previzualizare" icon="i-lucide-eye" color="neutral" variant="outline" @click="showPreview = true" />
        <UButton label="Salveaza" icon="i-lucide-save" :loading="loading" @click="save" />
      </div>
    </div>

    <UCard>
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <UFormField label="Denumire" required>
          <UInput v-model="state.name" class="w-full" />
        </UFormField>
        <UFormField label="Slug" required>
          <UInput v-model="state.slug" class="w-full" @input="slugManuallyEdited = true" />
        </UFormField>
        <UFormField label="Icon">
          <UInput v-model="state.icon" class="w-full" />
        </UFormField>
        <UFormField label="Perioada implicita">
          <USelect v-model="state.default_date_preset" :items="catalog.datePresets" value-key="value" class="w-full" />
        </UFormField>
      </div>
      <UFormField label="Descriere" class="mt-4">
        <UTextarea v-model="state.description" class="w-full" />
      </UFormField>
      <div class="mt-4 flex flex-wrap gap-6">
        <UFormField label="Activ"><USwitch v-model="state.is_active" /></UFormField>
        <UFormField label="Dashboard implicit"><USwitch v-model="state.is_default" /></UFormField>
      </div>
    </UCard>

    <div ref="blocksRoot" class="space-y-4">
      <AdminDashboardBlockEditor
        v-for="(block, index) in state.blocks"
        :key="block.id_ui_block ?? `block-${index}`"
        :model-value="block"
        :entities="entities"
        :catalog="catalog"
        @update:model-value="value => updateBlock(index, value)"
        @remove="removeBlock(index)"
      />
    </div>

    <UEmpty
      v-if="!state.blocks.length"
      icon="i-lucide-panels-top-left"
      title="Nicio sectiune"
      description="Adauga primul bloc si apoi configureaza widget-urile lui."
    />

    <UButton label="Adauga sectiune" icon="i-lucide-plus" color="neutral" variant="outline" @click="addBlock" />

    <UModal v-model:open="showPreview" title="Previzualizare dashboard" :ui="{ content: 'sm:max-w-6xl' }">
      <template #body>
        <AdminDashboardBuilderPreview :dashboard="state" />
      </template>
    </UModal>
  </div>
  <UAlert v-else-if="error" color="error" variant="subtle" title="Builder indisponibil" :description="error" />
  <USkeleton v-else class="h-96 w-full" />
</template>
