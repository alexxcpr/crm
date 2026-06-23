import type { Node, Edge } from '@vue-flow/core'
import type { Field, EntitySchema } from '~/types/schema'

export interface DataSource {
  nodeId: string
  label: string
  entitySlug: string
  fields: Field[]
  cardinality: 'single' | 'list' | 'item'
}

/**
 * Computes a data registry from the workflow node graph.
 * Each data-producing node (start, app_get_record, app_get_related)
 * registers its output entity and fields, making them referenceable
 * from any downstream node via $('<nodeId>').
 *
 * Uses wave-based resolution so chained relations work:
 *   Start → GetCompany → GetInvoice → ... (arbitrary depth).
 *
 * IMPORTANT: This registry does NOT make API calls. It extracts entity slugs
 * from node parameters synchronously and leaves fields empty ([]).
 * Fields are fetched on-demand via fetchEntitySchema() or fetchSourceFields()
 * only when the user opens a node's config panel.
 */
export function useWorkflowDataRegistry(
  nodes: Ref<Node[]>,
  startEntitySlug: Ref<string>,
  edges: Ref<Edge[]>,
) {
  const { apiFetch } = useApi()

  const dataSources = ref<DataSource[]>([])
  const loading = ref(false)

  // Cache of entitySlug → { name, fields }, populated on-demand when the user opens a node
  const schemaCache = new Map<string, { name: string, fields: Field[] }>()

  function nodeData(node: Node): Record<string, any> {
    return (node.data ?? {}) as Record<string, any>
  }

  /** Build the data registry synchronously — no API calls. */
  function computeRegistrySync() {
    const sources: DataSource[] = []
    const processed = new Set<string>()

    // 1. START node
    const startNode = nodes.value.find((n) => {
      const t = nodeData(n).nodeType
      return t === 'start' || t === 'trigger' || t === 'webhook_trigger'
    })

    if (startNode && startEntitySlug.value) {
      const label = nodeData(startNode).label || 'Start'
      sources.push({
        nodeId: startNode.id,
        label: `${label}: ${schemaCache.get(startEntitySlug.value)?.name ?? startEntitySlug.value}`,
        entitySlug: startEntitySlug.value,
        fields: schemaCache.get(startEntitySlug.value)?.fields ?? [],
        cardinality: 'single',
      })
      processed.add(startNode.id)
    }

    // 2. Wave-based resolution using cache — only resolves app_get_related
    //    nodes whose source entity schema has already been fetched on-demand
    let changed = true
    while (changed) {
      changed = false
      for (const node of nodes.value) {
        if (processed.has(node.id)) continue
        const data = nodeData(node)
        const nodeType: string = data.nodeType ?? ''

        if (nodeType === 'app_get_related') {
          const srcNodeId: string = data.parameters?.sourceNodeId ?? ''
          const relFieldSlug: string = data.parameters?.relationField ?? ''
          if (!srcNodeId || !relFieldSlug) continue

          const srcSource = sources.find((s) => s.nodeId === srcNodeId)
          if (!srcSource) continue

          const relField = srcSource.fields.find((f) => f.slug === relFieldSlug)
          if (!relField?.relation_entity_slug) continue

          const targetSlug = relField.relation_entity_slug
          sources.push({
            nodeId: node.id,
            label: `${data.label || 'Relatie'}: ${schemaCache.get(targetSlug)?.name ?? targetSlug}`,
            entitySlug: targetSlug,
            fields: schemaCache.get(targetSlug)?.fields ?? [],
            cardinality: 'single',
          })
          processed.add(node.id)
          changed = true
        } else if (nodeType === 'app_get_record') {
          const entitySlug: string = data.parameters?.entity ?? ''
          if (!entitySlug) continue
          const limit = Number(data.parameters?.limit)
          const cardinality = limit === 1 ? 'single' : 'list'

          sources.push({
            nodeId: node.id,
            label: `${data.label || 'Citeste'}: ${schemaCache.get(entitySlug)?.name ?? entitySlug}`,
            entitySlug,
            fields: schemaCache.get(entitySlug)?.fields ?? [],
            cardinality,
          })
          processed.add(node.id)
          changed = true
        } else if (nodeType === 'for_each') {
          const srcNodeId: string = data.parameters?.sourceNodeId ?? ''
          if (!srcNodeId) continue

          const listSource = sources.find((s) => s.nodeId === srcNodeId && s.cardinality === 'list')
          if (!listSource) continue

          sources.push({
            nodeId: node.id,
            label: `${data.label || 'Pentru fiecare'}: ${listSource.label}`,
            entitySlug: listSource.entitySlug,
            fields: listSource.fields,
            cardinality: 'item',
          })
          processed.add(node.id)
          changed = true
        } else if (nodeType === 'set_data') {
          const inEdge = edges.value.find(e => e.target === node.id)
          if (!inEdge) continue
          const predecessor = sources.find(s => s.nodeId === inEdge.source)
          if (!predecessor) continue

          // Merge predecessor fields with computed fields from assignments
          const assignments = (data.parameters?.assignments as any[]) ?? []
          const computedFields: Field[] = assignments
            .filter((a: any) => a.key)
            .map((a: any) => ({
              column_name: a.key,
              name: a.key,
              slug: `_computed_${a.key}`,
              data_type: 'numeric' as const,
              ui_type: 'number' as const,
            } as Field))

          sources.push({
            nodeId: node.id,
            label: `${data.label || 'Set Data'}: ${predecessor.label}`,
            entitySlug: predecessor.entitySlug,
            fields: [...predecessor.fields, ...computedFields],
            cardinality: predecessor.cardinality,
          })
          processed.add(node.id)
          changed = true
        }
      }
    }

    dataSources.value = sources
  }

  /** Fetch entity schema on-demand — called when user opens a node config panel. */
  async function fetchEntitySchema(entitySlug: string): Promise<Field[]> {
    if (!entitySlug) return []
    const cached = schemaCache.get(entitySlug)
    if (cached) return cached.fields

    loading.value = true
    try {
      const schema = await apiFetch<EntitySchema>(`/v1/schema/${entitySlug}`)
      const customFields: Field[] = schema.fields ?? []
      // System columns are not in the field table but are real columns available to reference
      const systemFields: Field[] = [
        { column_name: 'id', name: 'ID (sistem)', slug: '_sys_id', data_type: 'uuid', ui_type: 'text' },
        { column_name: 'date_created', name: 'Data creare (sistem)', slug: '_sys_date_created', data_type: 'datetime', ui_type: 'datetimepicker' },
        { column_name: 'date_updated', name: 'Data actualizare (sistem)', slug: '_sys_date_updated', data_type: 'datetime', ui_type: 'datetimepicker' },
        { column_name: 'id_profile', name: 'Profil owner (sistem)', slug: '_sys_id_profile', data_type: 'uuid', ui_type: 'text' },
      ] as Field[]
      const fields = [...systemFields, ...customFields]
      schemaCache.set(entitySlug, { name: schema.entity.name, fields })
      computeRegistrySync()
      return fields
    } catch {
      return []
    } finally {
      loading.value = false
    }
  }

  /** Get cached entity name for a slug (does not trigger fetch). */
  function getEntityName(entitySlug: string): string | null {
    return schemaCache.get(entitySlug)?.name ?? null
  }

  /** Fetch the entity schema for a data source node (by nodeId). */
  async function fetchSourceFields(nodeId: string): Promise<Field[]> {
    const source = dataSources.value.find(s => s.nodeId === nodeId)
    if (!source) return []
    return fetchEntitySchema(source.entitySlug)
  }

  // ─── Reactivity: recompute when node structure changes ───

  const graphFingerprint = computed(() => JSON.stringify(
    nodes.value.map(n => ({
      id: n.id,
      type: n.data?.nodeType,
      params: n.data?.parameters,
      label: n.data?.label,
    })),
  ))

  const edgeFingerprint = computed(() => JSON.stringify(
    edges.value.map(e => ({ source: e.source, target: e.target })),
  ))

  watch([graphFingerprint, edgeFingerprint, startEntitySlug], () => {
    nextTick(() => computeRegistrySync())
  })

  // Compute initial registry synchronously (no API calls)
  computeRegistrySync()

  return {
    dataSources,
    loading,
    /** Fetch entity schema for a given entity slug (cached). */
    fetchEntitySchema,
    /** Fetch entity schema for the entity of a data source node. */
    fetchSourceFields,
    /** Get cached entity name for a slug (does not trigger fetch). */
    getEntityName,
    /** Force recompute of the registry (e.g. after schema cache populated). */
    refresh: computeRegistrySync,
  }
}
