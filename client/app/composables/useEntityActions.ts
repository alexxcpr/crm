interface EntityAction {
  id_action: string
  id_entity: string
  name: string
  slug: string
  show_in_ui: boolean
  trigger_events: string[]
  trigger_conditions: Record<string, any> | null
  id_workflow: string | null
  workflow_name: string | null
  config: Record<string, any>
  is_active: boolean
  rank: number
  description: string | null
}

interface ApiResponse<T> {
  mesaj: string
  data: T
  cod: number
}

export function useEntityActions(entitySlug?: string | Ref<string | undefined>) {
  const { apiFetch } = useApi()
  const toast = useToast()

  const actions = ref<EntityAction[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const slug = computed(() => toValue(entitySlug))

  async function fetchActions() {
    if (!slug.value) return

    loading.value = true
    error.value = null
    try {
      const response = await apiFetch<ApiResponse<EntityAction[]>>(`/v1/actions/${slug.value}`)
      actions.value = response.data
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la incarcarea actiunilor'
    } finally {
      loading.value = false
    }
  }

  async function executeAction(actionSlug: string, recordId: string): Promise<boolean> {
    if (!slug.value) return false

    try {
      await apiFetch(`/v1/actions/${slug.value}/${actionSlug}/execute`, {
        method: 'POST',
        body: { recordId },
      })
      toast.add({ title: 'Actiune executata cu succes', color: 'success' })
      return true
    } catch (err: any) {
      const raw = err?.data?.message || err.message || 'Eroare la executia actiunii'
      const msg = Array.isArray(raw) ? raw.join(', ') : raw
      toast.add({ title: 'Eroare', description: msg, color: 'error' })
      return false
    }
  }

  const visibleActions = computed(() =>
    actions.value.filter(a => a.show_in_ui && a.is_active),
  )

  watch(slug, () => {
    if (slug.value) fetchActions()
  }, { immediate: true })

  return {
    actions,
    visibleActions,
    loading,
    error,
    fetchActions,
    executeAction,
  }
}
