<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { fetchWorkflow, updateWorkflow, activateWorkflow, deactivateWorkflow, syncWorkflow, loading, error } = useAdminWorkflows()

const workflowId = route.params.id as string
const workflow = ref<any>(null)
const builderRef = ref<any>(null)
const isDirty = ref(false)
const name = ref('')

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
    workflow.value = result
    toast.add({ title: 'Workflow salvat', color: 'success' })
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

async function onSync() {
  const result = await syncWorkflow(workflowId)
  if (result) {
    workflow.value = result
    toast.add({ title: 'Sincronizat cu n8n', color: 'success' })
  } else {
    toast.add({ title: 'Eroare la sync', description: error.value ?? '', color: 'error' })
  }
}

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
        <span class="text-xs text-gray-400">v{{ workflow.version }}</span>
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
          label="Sync n8n"
          icon="i-lucide-refresh-cw"
          variant="soft"
          color="neutral"
          size="sm"
          :loading="loading"
          @click="onSync"
        />

        <UButton
          label="Salveaza"
          icon="i-lucide-save"
          size="sm"
          :loading="loading"
          @click="save"
        />
      </div>
    </div>

    <!-- Builder -->
    <div class="flex-1 min-h-0">
      <WorkflowBuilder
        ref="builderRef"
        :workflow-id="workflowId"
        :initial-nodes="initialNodes"
        :initial-connections="initialConnections"
        @save="onSave"
        @dirty="isDirty = $event"
      />
    </div>
  </div>
</template>
