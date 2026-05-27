import { useVueFlow, type Node, type Edge, type Connection } from '@vue-flow/core'

export interface WorkflowNode {
  id: string
  type: string
  position: { x: number, y: number }
  parameters: Record<string, any>
  name: string
}

export interface WorkflowConnection {
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

export function useWorkflowBuilder(flowId?: string) {
  const { nodeTypes, getNodeType } = useNodeTypes()

  const {
    nodes,
    edges,
    addNodes,
    addEdges,
    removeNodes,
    removeEdges,
    onConnect,
    onNodesChange,
    onEdgesChange,
    fitView,
    project
  } = useVueFlow({ id: flowId })

  const selectedNodeId = ref<string | null>(null)
  const isDirty = ref(false)

  const selectedNode = computed(() => {
    if (!selectedNodeId.value) return null
    return nodes.value.find(n => n.id === selectedNodeId.value) ?? null
  })

  onConnect((connection: Connection) => {
    const edge: Edge = {
      id: `e-${connection.source}-${connection.target}-${connection.sourceHandle ?? 'default'}`,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle ?? undefined,
      targetHandle: connection.targetHandle ?? undefined,
      animated: true
    }
    addEdges([edge])
    isDirty.value = true
  })

  onNodesChange(() => {
    isDirty.value = true
  })

  onEdgesChange(() => {
    isDirty.value = true
  })

  function selectNode(nodeId: string | null) {
    selectedNodeId.value = nodeId
  }

  function addNode(type: string, position: { x: number, y: number }) {
    const nodeDef = getNodeType(type)
    if (!nodeDef) return

    const id = `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const label = nodeDef.label

    const newNode: Node = {
      id,
      type: 'custom',
      position,
      data: {
        nodeType: type,
        label,
        icon: nodeDef.icon,
        color: nodeDef.color,
        parameters: { ...nodeDef.defaults }
      }
    }

    addNodes([newNode])
    isDirty.value = true
    return id
  }

  function updateNodeParameters(nodeId: string, parameters: Record<string, any>) {
    const node = nodes.value.find(n => n.id === nodeId)
    if (!node) return

    node.data = {
      ...node.data,
      parameters: { ...node.data.parameters, ...parameters }
    }
    isDirty.value = true
  }

  function updateNodeLabel(nodeId: string, label: string) {
    const node = nodes.value.find(n => n.id === nodeId)
    if (!node) return

    node.data = { ...node.data, label }
    isDirty.value = true
  }

  function deleteSelectedNode() {
    if (!selectedNodeId.value) return
    removeNodes([selectedNodeId.value])
    selectedNodeId.value = null
    isDirty.value = true
  }

  function deleteEdge(edgeId: string) {
    removeEdges([edgeId])
    isDirty.value = true
  }

  function initStartNode() {
    if (nodes.value.length > 0) return
    addNode('start', { x: 250, y: 200 })
    isDirty.value = false
  }

  function loadWorkflow(workflowNodes: WorkflowNode[], workflowConnections: WorkflowConnection[]) {
    const flowNodes: Node[] = workflowNodes.map((wn) => {
      const nodeDef = getNodeType(wn.type)
      return {
        id: wn.id,
        type: 'custom',
        position: wn.position,
        data: {
          nodeType: wn.type,
          label: wn.name || nodeDef?.label || wn.type,
          icon: nodeDef?.icon ?? 'i-lucide-circle',
          color: nodeDef?.color ?? '#64748b',
          parameters: wn.parameters ?? {}
        }
      }
    })

    const flowEdges: Edge[] = workflowConnections.map((wc, idx) => ({
      id: `e-${wc.source}-${wc.target}-${idx}`,
      source: wc.source,
      target: wc.target,
      sourceHandle: wc.sourceHandle,
      targetHandle: wc.targetHandle,
      animated: true
    }))

    addNodes(flowNodes)
    addEdges(flowEdges)

    nextTick(() => fitView({ padding: 0.2 }))
    isDirty.value = false
  }

  function exportWorkflow(): { nodes: WorkflowNode[], connections: WorkflowConnection[] } {
    const exportedNodes: WorkflowNode[] = nodes.value.map(n => ({
      id: n.id,
      type: n.data.nodeType,
      position: { x: n.position.x, y: n.position.y },
      parameters: n.data.parameters ?? {},
      name: n.data.label
    }))

    const exportedConnections: WorkflowConnection[] = edges.value.map(e => ({
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined
    }))

    return { nodes: exportedNodes, connections: exportedConnections }
  }

  return {
    nodes,
    edges,
    selectedNodeId,
    selectedNode,
    isDirty,
    selectNode,
    addNode,
    updateNodeParameters,
    updateNodeLabel,
    deleteSelectedNode,
    deleteEdge,
    loadWorkflow,
    initStartNode,
    exportWorkflow,
    fitView,
    project
  }
}
