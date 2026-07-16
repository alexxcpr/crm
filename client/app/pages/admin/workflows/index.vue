<script setup lang="ts">
import { h } from 'vue'
import type { TableColumn } from '@nuxt/ui'

const UCheckbox = resolveComponent('UCheckbox')

const { workflows, loading, error, fetchWorkflows, deleteWorkflow, deleteWorkflows, activateWorkflow, deactivateWorkflow } = useAdminWorkflows()
const toast = useToast()
const router = useRouter()
const workflowsTableRoot = ref<HTMLElement | null>(null)
const { savingRank, persistRankOrder } = useRankReorder()

await fetchWorkflows()

useRankedTableDrag(workflowsTableRoot, {
  async onReorder(_group, oldIndex, newIndex) {
    const previous = [...workflows.value]
    workflows.value = normalizeRankOrder(moveRankedItem(workflows.value, oldIndex, newIndex))
    try {
      workflows.value = await persistRankOrder(
        '/v1/admin/workflows/reorder/ranks',
        workflows.value,
        workflow => workflow.id_workflow
      )
    } catch (err: any) {
      workflows.value = previous
      toast.add({
        title: 'Ordinea nu a putut fi salvata',
        description: err?.data?.message || err.message,
        color: 'error'
      })
    }
  }
})

const showDeleteConfirm = ref(false)
const deletingWorkflow = ref<any>(null)

function confirmDelete(wf: any) {
  deletingWorkflow.value = wf
  showDeleteConfirm.value = true
}

async function onConfirmDelete() {
  if (!deletingWorkflow.value) return

  const success = await deleteWorkflow(deletingWorkflow.value.id_workflow)
  if (success) {
    toast.add({ title: 'Workflow sters', color: 'success' })
  } else {
    toast.add({ title: 'Eroare la stergere', description: error.value ?? '', color: 'error' })
  }

  showDeleteConfirm.value = false
  deletingWorkflow.value = null
}

// ─── Bulk selection ───
const table = useTemplateRef('table')
const rowSelection = ref({})
const selectedCount = computed(() => Object.keys(rowSelection.value).length)

async function bulkDelete() {
  const selectedIndices = Object.keys(rowSelection.value).map(Number)
  const ids = selectedIndices.map(i => workflows.value[i]?.id_workflow).filter((id): id is string => !!id)
  const msg = await deleteWorkflows(ids)
  rowSelection.value = {}
  if (msg) {
    toast.add({ title: msg, color: 'success' })
  } else {
    toast.add({ title: 'Eroare la stergere', description: error.value ?? '', color: 'error' })
  }
}

async function toggleActivation(wf: any) {
  if (wf.status === 'active') {
    const result = await deactivateWorkflow(wf.id_workflow)
    if (result) {
      toast.add({ title: 'Workflow dezactivat', color: 'neutral' })
      await fetchWorkflows()
    }
  } else {
    const result = await activateWorkflow(wf.id_workflow)
    if (result) {
      toast.add({ title: 'Workflow activat', color: 'success' })
      await fetchWorkflows()
    } else {
      toast.add({ title: 'Eroare la activare', description: error.value ?? '', color: 'error' })
    }
  }
}

const columns: TableColumn<any>[] = [
  { id: 'drag', meta: { class: { th: 'w-8', td: 'w-8' } } },
  {
    id: 'select',
    meta: { class: { th: 'w-4', td: 'w-4' } },
    header: ({ table }) => h(UCheckbox, {
      'modelValue': table.getIsSomePageRowsSelected()
        ? 'indeterminate'
        : table.getIsAllPageRowsSelected(),
      'onUpdate:modelValue': (value: boolean | 'indeterminate') =>
        table.toggleAllPageRowsSelected(!!value),
      'ariaLabel': 'Selecteaza tot'
    }),
    cell: ({ row }) => h(UCheckbox, {
      'modelValue': row.getIsSelected(),
      'onUpdate:modelValue': (value: boolean | 'indeterminate') =>
        row.toggleSelected(!!value),
      'ariaLabel': 'Selecteaza rand'
    })
  },
  { id: 'edit', meta: { class: { th: 'w-10', td: 'w-10' } } },
  { accessorKey: 'name', header: 'Nume' },
  { accessorKey: 'slug', header: 'Slug' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'rank', header: 'Ordine' },
  { accessorKey: 'version', header: 'Versiune' },
  { accessorKey: 'n8n_workflow_id', header: 'n8n ID' },
  { id: 'actions', header: '' }
]

const statusColors: Record<string, string> = {
  draft: 'neutral',
  active: 'success',
  paused: 'warning'
}

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  active: 'Activ',
  paused: 'Pauza'
}

function getDropdownItems(wf: any) {
  return [[{
    label: 'Editeaza',
    icon: 'i-lucide-pencil',
    onClick: () => router.push(`/admin/workflows/${wf.id_workflow}`)
  }, {
    label: wf.status === 'active' ? 'Dezactiveaza' : 'Activeaza',
    icon: wf.status === 'active' ? 'i-lucide-pause' : 'i-lucide-play',
    onClick: () => toggleActivation(wf)
  }], [{
    label: 'Sterge',
    icon: 'i-lucide-trash-2',
    color: 'error' as const,
    onClick: () => confirmDelete(wf)
  }]]
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-lg font-semibold">
          Workflow-uri
        </h2>
        <p class="text-sm text-muted">
          Defineste si gestioneaza workflow-urile de automatizare
        </p>
      </div>
      <div class="flex items-center gap-1.5">
        <UButton
          v-if="selectedCount > 0"
          label="Sterge"
          color="error"
          variant="subtle"
          icon="i-lucide-trash"
          @click="bulkDelete"
        >
          <template #trailing>
            <UKbd>{{ selectedCount }}</UKbd>
          </template>
        </UButton>
        <UButton
          label="Workflow nou"
          icon="i-lucide-plus"
          @click="router.push('/admin/workflows/new')"
        />
      </div>
    </div>

    <div
      ref="workflowsTableRoot"
      data-rank-group="workflows"
      :data-rank-disabled="savingRank || loading"
    >
      <UTable
        ref="table"
        v-model:row-selection="rowSelection"
        row-key="id_workflow"
        :data="workflows"
        :columns="columns"
        :loading="loading"
        class="w-full"
      >
        <template #drag-cell>
          <UButton
            class="rank-drag-handle cursor-grab active:cursor-grabbing"
            icon="i-lucide-grip-vertical"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Muta workflow-ul"
          />
        </template>
        <template #edit-cell="{ row }">
          <UButton
            icon="i-lucide-pencil"
            label="Edit"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="router.push(`/admin/workflows/${row.original.id_workflow}`)"
          />
        </template>

        <template #name-cell="{ row }">
          <NuxtLink
            :to="`/admin/workflows/${row.original.id_workflow}`"
            class="text-primary-500 hover:underline font-medium"
          >
            {{ row.original.name }}
          </NuxtLink>
        </template>

        <template #status-cell="{ row }">
          <UBadge
            :label="statusLabels[row.original.status] ?? row.original.status"
            :color="(statusColors[row.original.status] ?? 'neutral') as any"
            variant="subtle"
            size="sm"
          />
        </template>

        <template #n8n_workflow_id-cell="{ row }">
          <span v-if="row.original.n8n_workflow_id" class="text-xs font-mono text-gray-500">
            {{ row.original.n8n_workflow_id }}
          </span>
          <span v-else class="text-xs text-gray-400">-</span>
        </template>

        <template #actions-cell="{ row }">
          <UDropdownMenu :items="getDropdownItems(row.original)">
            <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" />
          </UDropdownMenu>
        </template>
      </UTable>
    </div>

    <div v-if="!loading && workflows.length === 0" class="py-12">
      <UEmpty
        icon="i-lucide-workflow"
        title="Niciun workflow"
        description="Creeaza primul workflow de automatizare."
      >
        <template #actions>
          <UButton label="Workflow nou" icon="i-lucide-plus" @click="router.push('/admin/workflows/new')" />
        </template>
      </UEmpty>
    </div>

    <!-- Delete Confirm -->
    <UModal v-model:open="showDeleteConfirm" title="Confirmare stergere">
      <template #body>
        <p>
          Esti sigur ca vrei sa stergi workflow-ul
          <strong>{{ deletingWorkflow?.name }}</strong>?
        </p>
        <p class="text-sm text-gray-500 mt-1">
          Aceasta actiune va sterge si workflow-ul din n8n (daca exista).
        </p>
        <div class="flex items-center gap-3 justify-end mt-4">
          <UButton
            label="Anuleaza"
            color="neutral"
            variant="outline"
            @click="showDeleteConfirm = false"
          />
          <UButton
            label="Sterge"
            color="error"
            icon="i-lucide-trash-2"
            :loading="loading"
            @click="onConfirmDelete"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
