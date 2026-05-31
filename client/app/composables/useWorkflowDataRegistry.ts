import type { Node } from '@vue-flow/core'
import type { Field, EntitySchema } from '~/types/schema'

export interface DataSource {
  nodeId: string
  label: string
  entitySlug: string
  fields: Field[]
}

/**
 * Computes a data registry from the workflow node graph.
 * Each data-producing node (start, app_get_record, app_get_related)
 * registers its output entity and fields, making them referenceable
 * from any downstream node via $('<nodeId>').
 *
 * Uses wave-based resolution so chained relations work:
 *   Start → GetCompany → GetInvoice → ... (arbitrary depth).
 */
export function useWorkflowDataRegistry(
  nodes: Ref<Node[]>,
  startEntitySlug: Ref<string>,
) {
  const { apiFetch } = useApi()

  const dataSources = ref<DataSource[]>([])
  const loading = ref(false)

  function nodeData(node: Node): Record<string, any> {
    return (node.data ?? {}) as Record<string, any>
  }

  async function computeRegistry() {
    loading.value = true
    const sources: DataSource[] = []
    const processed = new Set<string>()

    // 1. Find START node and register it
    const startNode = nodes.value.find((n) => {
      const t = nodeData(n).nodeType
      return t === 'start' || t === 'trigger' || t === 'webhook_trigger'
    })

    if (startNode && startEntitySlug.value) {
      try {
        const schema = await apiFetch<EntitySchema>(
          `/v1/schema/${startEntitySlug.value}`,
        )
        sources.push({
          nodeId: startNode.id,
          label: `Start: ${schema.entity.name}`,
          entitySlug: startEntitySlug.value,
          fields: schema.fields,
        })
        processed.add(startNode.id)
      } catch {
        // entity might not exist yet — skip
      }
    }

    // 2. Wave-based resolution: each pass resolves nodes whose
    //    source dependencies are already in the registry
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
          if (!srcSource) continue // dependency not yet resolved

          const relField = srcSource.fields.find((f) => f.slug === relFieldSlug)
          if (!relField?.relation_entity_slug) continue

          try {
            const targetSchema = await apiFetch<EntitySchema>(
              `/v1/schema/${relField.relation_entity_slug}`,
            )
            sources.push({
              nodeId: node.id,
              label: `${data.label || 'Relatie'}: ${targetSchema.entity.name}`,
              entitySlug: relField.relation_entity_slug,
              fields: targetSchema.fields,
            })
            processed.add(node.id)
            changed = true
          } catch {
            // target entity schema not available — skip
          }
        } else if (nodeType === 'app_get_record') {
          const entitySlug: string = data.parameters?.entity ?? ''
          if (!entitySlug) continue

          try {
            const targetSchema = await apiFetch<EntitySchema>(
              `/v1/schema/${entitySlug}`,
            )
            sources.push({
              nodeId: node.id,
              label: `${data.label || 'Citeste'}: ${targetSchema.entity.name}`,
              entitySlug,
              fields: targetSchema.fields,
            })
            processed.add(node.id)
            changed = true
          } catch {
            // schema not available — skip
          }
        }
      }
    }

    dataSources.value = sources
    loading.value = false
  }

  // Debounced deep-watch: fires on any node data change, but rapid bursts
  // (e.g. position updates during drag) are coalesced into a single call.
  // Without debounce, dragging a node triggers a schema re-fetch per pixel.
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleCompute() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      computeRegistry()
    }, 150)
  }

  watch([nodes, startEntitySlug], () => {
    scheduleCompute()
  }, { deep: true })

  // Run immediately on setup so the registry is populated before the user
  // opens a node config panel (the watcher above only fires on change).
  scheduleCompute()

  return { dataSources, loading, computeRegistry }
}
