import type { EntitySchema, Field } from '~/types/schema'

const schemaCache = new Map<string, EntitySchema>()

export function clearEntitySchemaCache(key?: string) {
  if (key) {
    for (const cacheKey of schemaCache.keys()) {
      if (cacheKey.endsWith(`:${key}`)) {
        schemaCache.delete(cacheKey)
      }
    }
    return
  }

  schemaCache.clear()
}

export function useEntitySchema(entitySlug: MaybeRef<string>) {
  const slug = toValue(entitySlug)
  const { apiFetch } = useApi()
  const { data: authData } = useAuth()
  const { slug: tenantSlug } = useTenant()
  const activeProfileId = computed(() => (authData.value as { profileId?: string } | null)?.profileId ?? 'anonymous')

  const schema = useState<EntitySchema | null>(`schema-${slug}`, () => null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  function cacheKey(entityKey: string) {
    return `${tenantSlug.value ?? 'default'}:${activeProfileId.value}:${entityKey}`
  }

  async function fetchSchema(force = false) {
    const key = toValue(entitySlug)
    const scopedKey = cacheKey(key)

    if (!force && schemaCache.has(scopedKey)) {
      schema.value = schemaCache.get(scopedKey)!
      return
    }

    loading.value = true
    error.value = null

    try {
      const data = await apiFetch<EntitySchema>(`/v1/schema/${key}`)
      schemaCache.set(scopedKey, data)
      schema.value = data
    } catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la incarcarea schemei'
      console.error(`[useEntitySchema] Eroare pentru "${key}":`, err)
    } finally {
      loading.value = false
    }
  }

  function invalidateCache(key?: string) {
    clearEntitySchemaCache(key)
  }

  // ─── Computed helpers ───

  const entity = computed(() => schema.value?.entity ?? null)

  const fields = computed(() => schema.value?.fields ?? [])

  const tableFields = computed(() =>
    fields.value
      .filter(f => f.visible_in_table)
      .sort((a, b) => a.rank - b.rank)
  )

  const formFields = computed(() =>
    fields.value
      .filter(f => f.visible_in_form)
      .sort((a, b) => a.rank - b.rank)
  )

  const filterFields = computed(() =>
    fields.value.filter(f => f.is_filterable)
  )

  const tabs = computed(() => {
    return (schema.value?.tabs ?? []).sort((a, b) => a.rank - b.rank)
  })

  const groups = computed(() => tabs.value.map(t => t.slug))
  const capabilities = computed(() => schema.value?.capabilities ?? {
    read: null, create: null, update: null, delete: null, manage: null, change_ownership: null
  })

  function getFieldBySlug(fieldSlug: string): Field | undefined {
    return fields.value.find(f => f.slug === fieldSlug)
  }

  function getFieldsByGroup(groupSlug: string): Field[] {
    return formFields.value
      .filter(f => f.tab_slug === groupSlug)
      .sort((a, b) => a.rank - b.rank)
  }

  // Fetch automat la initializare
  fetchSchema()

  watch(activeProfileId, async (newProfileId, oldProfileId) => {
    if (newProfileId === oldProfileId) return

    schema.value = null
    await fetchSchema(true)
  })

  return {
    schema,
    entity,
    fields,
    tableFields,
    formFields,
    filterFields,
    tabs,
    groups,
    capabilities,
    loading,
    error,
    fetchSchema,
    invalidateCache,
    getFieldBySlug,
    getFieldsByGroup
  }
}
