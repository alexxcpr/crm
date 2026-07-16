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
          parameters: { ...node.data.parameters, entityName: name }
        }
      }
    }
    if (params.relationEntitySlug && !params.relationEntityName) {
      await fetchEntitySchema(params.relationEntitySlug)
      const name = getEntityName(params.relationEntitySlug)
      if (name && node.data) {
        node.data = {
          ...node.data,
          parameters: { ...node.data.parameters, relationEntityName: name }
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

  const enrichedNodes = exported.nodes.map((node) => {
    if (node.type === 'notification') {
      const target = dataSources.value.find(ds => ds.nodeId === node.parameters?.targetSourceNodeId)
      return {
        ...node,
        parameters: {
          ...node.parameters,
          targetEntitySlug: target?.entitySlug ?? ''
        }
      }
    }

    if (node.type === 'set_data') {
      const assignments = (node.parameters?.assignments ?? []).map((assignment: any) => ({
        ...assignment,
        tokens: (assignment.tokens ?? []).map((token: any) => {
          if (token.type !== 'field' || !token.sourceNodeId || !token.fieldSlug) return token

          const source = dataSources.value.find(ds => ds.nodeId === token.sourceNodeId)
          const field = source?.fields.find(f => f.column_name === token.fieldSlug)
          if (!field) return token

          return {
            ...token,
            fieldLabel: token.fieldLabel ?? field.name,
            dataType: token.dataType ?? field.data_type
          }
        })
      }))

      return {
        ...node,
        parameters: {
          ...node.parameters,
          assignments
        }
      }
    }

    if (node.type !== 'app_get_related') return node
    if (!node.parameters) return node

    const srcNodeId = node.parameters.sourceNodeId as string | undefined
    const relFieldSlug = node.parameters.relationField as string | undefined
    if (!srcNodeId || !relFieldSlug) return node

    const srcSource = dataSources.value.find(s => s.nodeId === srcNodeId)
    if (!srcSource) return node

    const relField = srcSource.fields.find(f => f.slug === relFieldSlug)
    if (!relField?.relation_entity_slug || !relField?.column_name) return node

    const isStart = srcSource.entitySlug === startEntitySlug.value
      && (nodes.value.find(n => n.id === srcNodeId)?.data?.nodeType === 'start'
        || nodes.value.find(n => n.id === srcNodeId)?.data?.nodeType === 'trigger'
        || nodes.value.find(n => n.id === srcNodeId)?.data?.nodeType === 'webhook_trigger')

    const recordIdExpr = isStart
      ? `={{$('${srcNodeId}').first().json.body.record.${relField.column_name}}}`
      : srcSource.cardinality === 'item'
        ? `={{$('${srcNodeId}').item.json.${relField.column_name}}}`
        : `={{$('${srcNodeId}').first().json.data.${relField.column_name}}}`

    return {
      ...node,
      parameters: {
        ...node.parameters,
        relationEntitySlug: relField.relation_entity_slug,
        relationRecordIdExpr: recordIdExpr
      }
    }
  })

  return { ...exported, nodes: enrichedNodes }
}

function normalizeLegacyEmailNodes(inputNodes: any[]) {
  return inputNodes.map((node) => {
    if (node.type !== 'email') return node
    const params = { ...(node.parameters ?? {}) }
    const asSource = (value: unknown) => value && typeof value === 'object'
      ? value
      : { sourceType: 'static', value: String(value ?? '') }
    const normalized = {
      ...params,
      to: asSource(params.to),
      subject: asSource(params.subject),
      content: asSource(params.content ?? params.body)
    }
    delete normalized.from
    delete normalized.body
    return { ...node, parameters: normalized }
  })
}

watch(isDirty, val => emit('dirty', val))

onMounted(async () => {
  if (props.initialNodes?.length || props.initialConnections?.length) {
    loadWorkflow(normalizeLegacyEmailNodes(props.initialNodes ?? []), props.initialConnections ?? [])
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
  nextTick(() => refreshRegistry())
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  event.dataTransfer!.dropEffect = 'move'
}

function onUpdateNodeParameters(nodeId: string, params: Record<string, any>) {
  updateNodeParameters(nodeId, params)
  nextTick(() => refreshRegistry())
}

function onUpdateNodeLabel(nodeId: string, label: string) {
  updateNodeLabel(nodeId, label)
  nextTick(() => refreshRegistry())
}

function onDeleteSelectedNode() {
  deleteSelectedNode()
  nextTick(() => refreshRegistry())
}

const toast = useToast()
const { getNodeType } = useNodeTypes()
const { integrations: smtpIntegrations, fetchIntegrations: fetchSmtpIntegrations } = useAdminIntegrations()

const TRIGGER_TYPES = new Set(['start', 'trigger', 'webhook_trigger'])

function isMissingRequiredValue(value: unknown) {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

function workflowValueComplete(value: any) {
  if (!value || typeof value !== 'object') return false
  if (value.sourceType === 'static') return String(value.value ?? '').trim().length > 0
  return value.sourceType === 'node_output' && !!value.sourceNodeId && !!value.sourceFieldSlug
}

function findListSourceReferences(value: unknown, listSourceIds: Set<string>, found = new Set<string>()) {
  if (!value || typeof value !== 'object') return found

  if (Array.isArray(value)) {
    for (const item of value) findListSourceReferences(item, listSourceIds, found)
    return found
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'sourceNodeId' && typeof nested === 'string' && listSourceIds.has(nested)) {
      found.add(nested)
    } else {
      findListSourceReferences(nested, listSourceIds, found)
    }
  }

  return found
}

function hasUpstreamPath(sourceId: string, targetId: string) {
  const queue = [sourceId]
  const visited = new Set<string>()
  while (queue.length) {
    const current = queue.shift()!
    if (current === targetId) return true
    if (visited.has(current)) continue
    visited.add(current)
    for (const edge of edges.value.filter(edge => edge.source === current)) queue.push(edge.target)
  }
  return false
}

function templateHasContent(tokens: any[]) {
  return tokens.some(token => token?.type === 'field' || (token?.type === 'literal' && String(token.value ?? '').trim()))
}

function maximumDelayBefore(nodeId: string, visiting = new Set<string>(), memo = new Map<string, number>()): number {
  if (memo.has(nodeId)) return memo.get(nodeId)!
  if (visiting.has(nodeId)) throw new Error('cycle')
  const nextVisiting = new Set(visiting).add(nodeId)
  const incoming = edges.value.filter(edge => edge.target === nodeId)
  const multipliers: Record<string, number> = {
    seconds: 1000,
    minutes: 60_000,
    hours: 3_600_000,
    days: 86_400_000
  }
  let maximum = 0
  for (const edge of incoming) {
    const parent = nodes.value.find(node => node.id === edge.source)
    const parentDelay = parent?.data?.nodeType === 'delay'
      ? Math.max(0, Number(parent.data?.parameters?.duration ?? 0))
      * (multipliers[parent.data?.parameters?.unit ?? 'minutes'] ?? 60_000)
      : 0
    maximum = Math.max(maximum, maximumDelayBefore(edge.source, nextVisiting, memo) + parentDelay)
  }
  memo.set(nodeId, maximum)
  return maximum
}

async function save() {
  const triggerNodes = nodes.value.filter(n => TRIGGER_TYPES.has(n.data?.nodeType))
  if (triggerNodes.length === 0) {
    toast.add({
      title: 'Lipseste nodul de start',
      description: 'Adauga un nod START inainte de a salva.',
      color: 'error'
    })
    return
  }
  if (triggerNodes.length > 1) {
    toast.add({
      title: 'Prea multe noduri de start',
      description: `Ai ${triggerNodes.length} noduri de start. Un workflow poate avea un singur punct de intrare.`,
      color: 'error'
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
          color: 'error'
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
  const orphanNodes = nodes.value.filter((n) => {
    if (TRIGGER_TYPES.has(n.data?.nodeType)) return false
    return !nodesWithInput.has(n.id)
  })
  if (orphanNodes.length > 0) {
    const names = orphanNodes.map(n => `"${n.data.label}"`).join(', ')
    toast.add({
      title: 'Noduri fara intrare',
      description: `Urmatoarele noduri nu au nicio conexiune de intrare si nu vor fi executate vreodata: ${names}. Conecteaza-le sau sterge-le.`,
      color: 'error'
    })
    return
  }

  const dataSourceByNodeId = new Map(dataSources.value.map(ds => [ds.nodeId, ds]))
  const listSourceIds = new Set(
    dataSources.value.filter(ds => ds.cardinality === 'list').map(ds => ds.nodeId)
  )

  const emailNodes = nodes.value.filter(node => node.data?.nodeType === 'email')
  if (emailNodes.length > 0) await fetchSmtpIntegrations(true)
  const activeIntegrationIds = new Set(
    smtpIntegrations.value.filter(item => item.is_active).map(item => item.id_integration)
  )

  for (const node of emailNodes) {
    const params = node.data?.parameters ?? {}
    if (!activeIntegrationIds.has(String(params.integrationId ?? ''))) {
      toast.add({
        title: `Integrare SMTP invalida in nodul "${node.data.label}"`,
        description: 'Alege un cont SMTP activ din Administrare > Integrari.',
        color: 'error'
      })
      return
    }

    for (const [key, label] of [['to', 'Catre'], ['subject', 'Subiect'], ['content', 'Continut']] as const) {
      const value = params[key]
      if (!workflowValueComplete(value)) {
        toast.add({
          title: `Configuratie incompleta in nodul "${node.data.label}"`,
          description: `Campul "${label}" trebuie sa aiba o valoare fixa sau un camp dintr-un nod anterior.`,
          color: 'error'
        })
        return
      }
      if (key === 'to' && value.sourceType === 'static') {
        const email = String(value.value ?? '').trim()
        if (email.includes(',') || email.includes(';') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          toast.add({
            title: `Destinatar invalid in nodul "${node.data.label}"`,
            description: 'Catre trebuie sa fie o singura adresa de email valida.',
            color: 'error'
          })
          return
        }
      }
      if (value.sourceType === 'node_output') {
        const source = dataSourceByNodeId.get(value.sourceNodeId)
        if (!source || source.cardinality === 'list' || !hasUpstreamPath(value.sourceNodeId, node.id)) {
          toast.add({
            title: `Sursa invalida in nodul "${node.data.label}"`,
            description: `Campul "${label}" trebuie sa vina dintr-un nod anterior single/item. Pentru liste foloseste "Pentru Fiecare".`,
            color: 'error'
          })
          return
        }
      }
    }
  }

  for (const node of nodes.value.filter(node => node.data?.nodeType === 'notification')) {
    const params = node.data?.parameters ?? {}
    const recipient = params.recipient ?? {}
    const recipientComplete = recipient.sourceType === 'static'
      ? !!recipient.profileId
      : !!recipient.sourceNodeId && !!recipient.sourceFieldSlug

    if (!recipientComplete || !templateHasContent(params.subjectTokens ?? []) || !templateHasContent(params.contentTokens ?? [])) {
      toast.add({
        title: `Configuratie incompleta in nodul "${node.data.label}"`,
        description: 'Completeaza destinatarul, subiectul si continutul notificarii.',
        color: 'error'
      })
      return
    }

    const sourceIds = new Set<string>([
      ...(recipient.sourceNodeId ? [recipient.sourceNodeId] : []),
      ...(params.subjectTokens ?? []).map((token: any) => token.sourceNodeId).filter(Boolean),
      ...(params.contentTokens ?? []).map((token: any) => token.sourceNodeId).filter(Boolean),
      ...(params.targetSourceNodeId ? [params.targetSourceNodeId] : [])
    ])

    for (const sourceId of sourceIds) {
      const source = dataSourceByNodeId.get(sourceId)
      if (!source || source.cardinality === 'list' || !hasUpstreamPath(sourceId, node.id)) {
        toast.add({
          title: `Sursa invalida in nodul "${node.data.label}"`,
          description: 'Fiecare camp trebuie sa vina dintr-un nod anterior single/item. Pentru liste foloseste "Pentru Fiecare".',
          color: 'error'
        })
        return
      }
    }

    try {
      if (maximumDelayBefore(node.id) > 30 * 24 * 60 * 60 * 1000) {
        toast.add({
          title: `Intarziere prea mare in nodul "${node.data.label}"`,
          description: 'Durata cumulata pana la notificare nu poate depasi 30 de zile.',
          color: 'error'
        })
        return
      }
    } catch {
      toast.add({
        title: `Ciclu invalid inainte de "${node.data.label}"`,
        description: 'Notificarile intarziate nu pot fi configurate pe un traseu ciclic.',
        color: 'error'
      })
      return
    }
  }

  for (const node of nodes.value) {
    if (node.data?.nodeType !== 'for_each') continue

    const sourceNodeId = String(node.data?.parameters?.sourceNodeId ?? '')
    const source = dataSourceByNodeId.get(sourceNodeId)
    if (!source || source.cardinality !== 'list') {
      toast.add({
        title: `Lista lipsa in nodul "${node.data.label}"`,
        description: 'Alege un nod "Citeste Inregistrari" care intoarce mai multe inregistrari.',
        color: 'error'
      })
      return
    }

    const hasSourceEdge = edges.value.some(edge => edge.source === sourceNodeId && edge.target === node.id)
    if (!hasSourceEdge) {
      toast.add({
        title: `Conexiune lipsa in nodul "${node.data.label}"`,
        description: 'Conecteaza nodul care citeste lista direct la nodul "Pentru fiecare".',
        color: 'error'
      })
      return
    }
  }

  for (const node of nodes.value) {
    if (node.data?.nodeType === 'for_each') continue

    const refs = findListSourceReferences(node.data?.parameters ?? {}, listSourceIds)
    if (refs.size === 0) continue

    toast.add({
      title: `Sursa lista folosita direct in nodul "${node.data.label}"`,
      description: 'Listele trebuie parcurse prin nodul "Pentru fiecare" inainte sa alegi campuri din ele.',
      color: 'error'
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
      @update-parameters="onUpdateNodeParameters"
      @update-label="onUpdateNodeLabel"
      @delete-node="onDeleteSelectedNode"
      @close="selectNode(null)"
    />
  </div>
</template>
