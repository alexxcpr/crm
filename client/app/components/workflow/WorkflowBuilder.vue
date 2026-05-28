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

watch(isDirty, val => emit('dirty', val))

onMounted(() => {
  if (props.initialNodes?.length || props.initialConnections?.length) {
    loadWorkflow(props.initialNodes ?? [], props.initialConnections ?? [])
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

function save() {
  const data = exportWorkflow()
  emit('save', data)
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
      @update-parameters="updateNodeParameters"
      @update-label="updateNodeLabel"
      @delete-node="deleteSelectedNode"
      @close="selectNode(null)"
    />
  </div>
</template>
