<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { fetchWorkflow, updateWorkflow, activateWorkflow, deactivateWorkflow, loading, error } = useAdminWorkflows()
const { apiFetch } = useApi()

const workflowId = route.params.id as string
const workflow = ref<any>(null)
const builderRef = ref<any>(null)
const isDirty = ref(false)
const name = ref('')
const activeTab = ref<'editor' | 'executions'>('editor')
const executions = ref<any[]>([])
const executionsMeta = ref({ page: 1, limit: 25, total: 0, totalPages: 0 })
const executionsLoading = ref(false)
const selectedExecution = ref<any>(null)

const wfData = await fetchWorkflow(workflowId)
if (!wfData) {
  toast.add({ title: 'Workflow negasit', color: 'error' })
  router.push('/admin/workflows')
} else {
  workflow.value = wfData
  name.value = wfData.name
}

const initialNodes = computed(() => {
  if (!workflow.value) return []
  return typeof workflow.value.nodes === 'string'
    ? JSON.parse(workflow.value.nodes)
    : workflow.value.nodes ?? []
})

const initialConnections = computed(() => {
  if (!workflow.value) return []
  return typeof workflow.value.connections === 'string'
    ? JSON.parse(workflow.value.connections)
    : workflow.value.connections ?? []
})

async function onSave(payload: { nodes: any[], connections: any[] }) {
  const result = await updateWorkflow(workflowId, {
    name: name.value || undefined,
    nodes: payload.nodes,
    connections: payload.connections
  })

  if (result) {
    workflow.value = await fetchWorkflow(workflowId) ?? result
    toast.add({
      title: result.isValid ? 'Workflow salvat' : 'Revizie salvata cu erori',
      description: result.isValid
        ? result.published ? 'Revizia valida a fost publicata automat.' : undefined
        : (result.validationErrors ?? []).map((item: any) => item.message).join(' '),
      color: result.isValid ? 'success' : 'warning'
    })
    isDirty.value = false
  } else {
    toast.add({ title: 'Eroare la salvare', description: error.value ?? '', color: 'error' })
  }
}

function save() {
  builderRef.value?.save()
}

async function onActivate() {
  const result = await activateWorkflow(workflowId)
  if (result) {
    workflow.value = result
    toast.add({ title: 'Workflow activat', color: 'success' })
  } else {
    toast.add({ title: 'Eroare la activare', description: error.value ?? '', color: 'error' })
  }
}

async function onDeactivate() {
  const result = await deactivateWorkflow(workflowId)
  if (result) {
    workflow.value = result
    toast.add({ title: 'Workflow dezactivat', color: 'neutral' })
  } else {
    toast.add({ title: 'Eroare', description: error.value ?? '', color: 'error' })
  }
}

async function loadExecutions(page = 1) {
  executionsLoading.value = true
  try {
    const response = await apiFetch<any>(`/v1/admin/workflows/${workflowId}/executions`, {
      query: { page, limit: executionsMeta.value.limit }
    })
    executions.value = response.data ?? []
    executionsMeta.value = response.meta ?? executionsMeta.value
  } finally {
    executionsLoading.value = false
  }
}

async function openExecution(executionId: string) {
  const response = await apiFetch<any>(`/v1/admin/workflows/${workflowId}/executions/${executionId}`)
  selectedExecution.value = response.data
}

watch(activeTab, tab => {
  if (tab === 'executions') loadExecutions()
})

const executionColumns = [
  { accessorKey: 'trigger_type', header: 'Trigger' },
  { accessorKey: 'record_id', header: 'Record' },
  { accessorKey: 'actor_display_name', header: 'Actor' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'duration_ms', header: 'Durata' },
  { id: 'details', header: '' }
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
</script>

<template>
  <div v-if="workflow" class="flex flex-col h-[calc(100vh-180px)]">
    <!-- Top Bar -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
      <div class="flex items-center gap-3">
        <UButton
          icon="i-lucide-arrow-left"
          variant="ghost"
          color="neutral"
          size="sm"
          @click="router.push('/admin/workflows')"
        />
        <UInput
          v-model="name"
          placeholder="Denumire workflow..."
          size="md"
          variant="none"
          class="w-72 font-semibold text-lg"
        />
        <UBadge
          :label="statusLabels[workflow.status] ?? workflow.status"
          :color="(statusColors[workflow.status] ?? 'neutral') as any"
          variant="subtle"
          size="sm"
        />
        <span class="text-xs text-gray-400">rev. {{ workflow.revision ?? workflow.version }}</span>
      </div>

      <div class="flex items-center gap-2">
        <UBadge
          v-if="isDirty"
          label="Nesalvat"
          color="warning"
          variant="solid"
          size="md"
        />

        <UButton
          v-if="workflow.status !== 'active'"
          label="Activeaza"
          icon="i-lucide-play"
          color="success"
          variant="soft"
          size="sm"
          :loading="loading"
          @click="onActivate"
        />
        <UButton
          v-else
          label="Dezactiveaza"
          icon="i-lucide-pause"
          color="warning"
          variant="soft"
          size="sm"
          :loading="loading"
          @click="onDeactivate"
        />

        <UButton
          v-if="activeTab === 'editor'"
          label="Salveaza"
          icon="i-lucide-save"
          size="sm"
          :loading="loading"
          @click="save"
        />
      </div>
    </div>

    <div class="flex items-center gap-2 border-b border-default px-4 py-2">
      <UButton
        label="Editor"
        icon="i-lucide-workflow"
        size="xs"
        :variant="activeTab === 'editor' ? 'soft' : 'ghost'"
        @click="activeTab = 'editor'"
      />
      <UButton
        label="Executii"
        icon="i-lucide-history"
        size="xs"
        :variant="activeTab === 'executions' ? 'soft' : 'ghost'"
        @click="activeTab = 'executions'"
      />
      <UBadge
        v-if="workflow.isValid === false"
        label="Revizia curenta are erori"
        color="error"
        variant="subtle"
      />
    </div>

    <div v-if="activeTab === 'editor'" class="flex-1 min-h-0">
      <UAlert
        v-if="workflow.isValid === false && workflow.validationErrors?.length"
        color="error"
        variant="subtle"
        title="Revizia trebuie corectata"
        :description="workflow.validationErrors.map((item: any) => item.message).join(' ')"
        class="m-4"
      />
      <WorkflowBuilder
        ref="builderRef"
        :workflow-id="workflowId"
        :initial-nodes="initialNodes"
        :initial-connections="initialConnections"
        @save="onSave"
        @dirty="isDirty = $event"
      />
    </div>

    <div v-else class="flex-1 min-h-0 overflow-auto p-4">
      <UTable
        :data="executions"
        :columns="executionColumns"
        :loading="executionsLoading"
      >
        <template #actor_display_name-cell="{ row }">
          {{ row.original.actor_display_name || row.original.actor_username || '-' }}
        </template>
        <template #status-cell="{ row }">
          <UBadge
            :label="row.original.status"
            :color="row.original.status === 'completed' ? 'success' : row.original.status === 'failed' ? 'error' : 'warning'"
            variant="subtle"
          />
        </template>
        <template #duration_ms-cell="{ row }">
          {{ row.original.duration_ms == null ? '-' : `${row.original.duration_ms} ms` }}
        </template>
        <template #details-cell="{ row }">
          <UButton
            label="Detalii"
            icon="i-lucide-search"
            size="xs"
            color="neutral"
            variant="ghost"
            @click="openExecution(row.original.id_execution)"
          />
        </template>
      </UTable>
      <UPagination
        v-if="executionsMeta.totalPages > 1"
        class="mt-4"
        :page="executionsMeta.page"
        :total="executionsMeta.total"
        :items-per-page="executionsMeta.limit"
        @update:page="loadExecutions"
      />
    </div>

    <UModal
      :open="!!selectedExecution"
      title="Detalii executie"
      @update:open="value => { if (!value) selectedExecution = null }"
    >
      <template #body>
        <div v-if="selectedExecution" class="space-y-4">
          <UAlert
            v-if="selectedExecution.error_message"
            color="error"
            title="Executie esuata"
            :description="selectedExecution.error_message"
          />
          <div
            v-for="run in selectedExecution.nodeRuns"
            :key="run.id_node_run"
            class="rounded-lg border border-default p-3"
          >
            <div class="mb-2 flex items-center justify-between">
              <span class="font-medium">{{ run.node_type }} · {{ run.node_id }}</span>
              <UBadge
                :label="run.status"
                :color="run.status === 'completed' ? 'success' : 'error'"
                variant="subtle"
              />
            </div>
            <p class="text-xs text-muted">
              Run {{ run.run_index }}, item {{ run.item_index }}, {{ run.duration_ms ?? 0 }} ms
            </p>
            <p v-if="run.error_message" class="mt-2 text-sm text-error">
              {{ run.error_message }}
            </p>
            <details class="mt-2 text-xs">
              <summary class="cursor-pointer">Input / Output sanitizat</summary>
              <pre class="mt-2 max-h-52 overflow-auto rounded bg-elevated p-2">{{ JSON.stringify({ input: run.input_snapshot, output: run.output_snapshot }, null, 2) }}</pre>
            </details>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
