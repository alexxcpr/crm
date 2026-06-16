<script setup lang="ts">
import { VueFlow, type NodeMouseEvent } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import CustomNode from './nodes/CustomNode.vue'

const props = defineProps<{
  workflowId?: string
  initialNodes?: any[]
  initialConnections?: any[]
}>()

const emit = defineEmits<{
  save: [payload: { nodes: any[], connections: any[] }]
  dirty: [isDirty: boolean]
}>()

const flowId = computed(() => props.workflowId ?? 'workflow-builder')

const {
  nodes,
  edges,
  selectedNode,
  isDirty,
  selectNode,
  addNode,
  updateNodeParameters,
  updateNodeLabel,
  deleteSelectedNode,
  loadWorkflow,
  exportWorkflow,
  fitView,
  project,
  initStartNode
} = useWorkflowBuilder(flowId.value)

// ─── Data registry ───
const startEntitySlug = computed(() => {
  const startNode = nodes.value.find(
    n => n.data?.nodeType === 'start' || n.data?.nodeType === 'trigger' || n.data?.nodeType === 'webhook_trigger'
  )
  return (startNode?.data?.parameters?.entity ?? '') as string
})

const { dataSources, fetchEntitySchema, fetchSourceFields, getEntityName, refresh: refreshRegistry } = useWorkflowDataRegistry(nodes, startEntitySlug, edges)

// Keep registry in sync after any node/edge mutation
watch(isDirty, (dirty) => {
  if (dirty) nextTick(() => refreshRegistry())
})

// ─── Resolve entity names for all nodes that have entity params but no name ───
async function resolveEntityNames() {
  for (const node of nodes.value) {
    const params = (node.data?.parameters ?? {}) as Record<string, any>
    if (params.entity && !params.entityName) {
      await fetchEntitySchema(params.entity)
      const name = getEntityName(params.entity)
      if (name && node.data) {
        node.data = {
          ...node.data,
          parameters: { ...node.data.parameters, entityName: name },
        }
      }
    }
    if (params.relationEntitySlug && !params.relationEntityName) {
      await fetchEntitySchema(params.relationEntitySlug)
      const name = getEntityName(params.relationEntitySlug)
      if (name && node.data) {
        node.data = {
          ...node.data,
          parameters: { ...node.data.parameters, relationEntityName: name },
        }
      }
    }
  }
}

// ─── Enrich app_get_related nodes before save ───
async function enrichBeforeSave(exported: { nodes: any[], connections: any[] }): Promise<{ nodes: any[], connections: any[] }> {
  // Fetch schemas for all data sources so relation fields can be resolved.
  // This is the ONLY place that may fetch multiple schemas — and only at save time.
  const fetchPromises = dataSources.value.map(ds => fetchEntitySchema(ds.entitySlug))
  await Promise.all(fetchPromises)

  const enrichedNodes = exported.nodes.map(node => {
    if (node.type !== 'app_get_related') return node
    if (!node.parameters) return node

    const srcNodeId = node.parameters.sourceNodeId as string | undefined
    const relFieldSlug = node.parameters.relationField as string | undefined
    if (!srcNodeId || !relFieldSlug) return node

    const srcSource = dataSources.value.find(s => s.nodeId === srcNodeId)
    if (!srcSource) return node

    const relField = srcSource.fields.find(f => f.slug === relFieldSlug)
    if (!relField?.relation_entity_slug || !relField?.column_name) return node

    const isStart = srcSource.entitySlug === startEntitySlug.value &&
      (nodes.value.find(n => n.id === srcNodeId)?.data?.nodeType === 'start' ||
       nodes.value.find(n => n.id === srcNodeId)?.data?.nodeType === 'trigger' ||
       nodes.value.find(n => n.id === srcNodeId)?.data?.nodeType === 'webhook_trigger')

    const recordIdExpr = isStart
      ? `={{$('${srcNodeId}').first().json.body.record.${relField.column_name}}}`
      : `={{$('${srcNodeId}').first().json.data.${relField.column_name}}}`

    return {
      ...node,
      parameters: {
        ...node.parameters,
        relationEntitySlug: relField.relation_entity_slug,
        relationRecordIdExpr: recordIdExpr,
      }
    }
  })

  return { ...exported, nodes: enrichedNodes }
}

watch(isDirty, val => emit('dirty', val))

onMounted(async () => {
  if (props.initialNodes?.length || props.initialConnections?.length) {
    loadWorkflow(props.initialNodes ?? [], props.initialConnections ?? [])
    await resolveEntityNames()
  } else {
    initStartNode()
  }
})

function onNodeClick(event: NodeMouseEvent) {
  selectNode(event.node.id)
}

function onPaneClick() {
  selectNode(null)
}

function onDrop(event: DragEvent) {
  const nodeType = event.dataTransfer?.getData('application/workflow-node')
  if (!nodeType) return

  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const position = project({
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top
  })

  addNode(nodeType, position)
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  event.dataTransfer!.dropEffect = 'move'
}

const toast = useToast()
const { getNodeType } = useNodeTypes()

const TRIGGER_TYPES = new Set(['start', 'trigger', 'webhook_trigger'])

function isMissingRequiredValue(value: unknown) {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

async function save() {
  const triggerNodes = nodes.value.filter(n => TRIGGER_TYPES.has(n.data?.nodeType))
  if (triggerNodes.length === 0) {
    toast.add({
      title: 'Lipseste nodul de start',
      description: 'Adauga un nod START inainte de a salva.',
      color: 'error',
    })
    return
  }
  if (triggerNodes.length > 1) {
    toast.add({
      title: 'Prea multe noduri de start',
      description: `Ai ${triggerNodes.length} noduri de start. Un workflow poate avea un singur punct de intrare.`,
      color: 'error',
    })
    return
  }

  // Validate required fields for each node
  for (const node of nodes.value) {
    const nodeType = node.data?.nodeType as string | undefined
    if (!nodeType) continue

    const def = getNodeType(nodeType)
    if (!def) continue

    const params: Record<string, any> = node.data?.parameters ?? {}
    for (const field of def.configFields) {
      if (!field.required) continue
      const value = params[field.key]
      if (isMissingRequiredValue(value)) {
        toast.add({
          title: `Camp obligatoriu necompletat in nodul "${node.data.label}"`,
          description: `Campul "${field.label}" este obligatoriu. Completeaza-l inainte de a salva.`,
          color: 'error',
        })
        return
      }
    }
  }

  // Detect orphan nodes: every non-start node must have at least one incoming edge.
  // Nodes with outgoing edges but no input will never be triggered.
  const nodesWithInput = new Set<string>()
  for (const edge of edges.value) {
    nodesWithInput.add(edge.target)
  }
  const orphanNodes = nodes.value.filter(n => {
    if (TRIGGER_TYPES.has(n.data?.nodeType)) return false
    return !nodesWithInput.has(n.id)
  })
  if (orphanNodes.length > 0) {
    const names = orphanNodes.map(n => `"${n.data.label}"`).join(', ')
    toast.add({
      title: 'Noduri fara intrare',
      description: `Urmatoarele noduri nu au nicio conexiune de intrare si nu vor fi executate vreodata: ${names}. Conecteaza-le sau sterge-le.`,
      color: 'error',
    })
    return
  }

  const data = exportWorkflow()
  const enriched = await enrichBeforeSave(data)
  emit('save', enriched)
  isDirty.value = false
}

defineExpose({ save, exportWorkflow, fitView })
</script>

<template>
  <div class="flex h-full w-full">
    <!-- Left Palette -->
    <WorkflowNodePalette />

    <!-- Canvas -->
    <div class="flex-1 relative">
      <VueFlow
        :id="flowId"
        class="h-full"
        :default-edge-options="{ animated: true, type: 'smoothstep' }"
        :snap-to-grid="true"
        :snap-grid="[15, 15]"
        fit-view-on-init
        @node-click="onNodeClick"
        @pane-click="onPaneClick"
        @drop="onDrop"
        @dragover="onDragOver"
      >
        <template #node-custom="nodeProps">
          <CustomNode v-bind="nodeProps" />
        </template>

        <Background :gap="15" :size="1" />
      </VueFlow>

      <!-- Toolbar overlay -->
      <div class="absolute top-3 right-3 flex items-center gap-2">
        <UButton
          icon="i-lucide-maximize-2"
          variant="soft"
          color="neutral"
          size="xs"
          title="Fit la continut"
          @click="fitView({ padding: 0.2 })"
        />
      </div>
    </div>

    <!-- Right Panel -->
    <WorkflowPanelsNodeConfigPanel
      :node="selectedNode"
      :data-sources="dataSources"
      :fetch-entity-schema="fetchEntitySchema"
      :fetch-source-fields="fetchSourceFields"
      @update-parameters="updateNodeParameters"
      @update-label="updateNodeLabel"
      @delete-node="deleteSelectedNode"
      @close="selectNode(null)"
    />
  </div>
</template>
