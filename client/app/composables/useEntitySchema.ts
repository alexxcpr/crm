import type { EntitySchema, Field } from '~/types/schema'

const schemaCache = new Map<string, EntitySchema>()

export function useEntitySchema(entitySlug: MaybeRef<string>) {
  const slug = toValue(entitySlug)
  const { apiFetch } = useApi()

  const schema = useState<EntitySchema | null>(`schema-${slug}`, () => null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchSchema(force = false) {
    const key = toValue(entitySlug)

    if (!force && schemaCache.has(key)) {
      schema.value = schemaCache.get(key)!
      return
    }

    loading.value = true
    error.value = null

    try {
      const data = await apiFetch<EntitySchema>(`/v1/schema/${key}`)
      schemaCache.set(key, data)
      schema.value = data
    }
    catch (err: any) {
      error.value = err?.data?.message || err.message || 'Eroare la incarcarea schemei'
      console.error(`[useEntitySchema] Eroare pentru "${key}":`, err)
    }
    finally {
      loading.value = false
    }
  }

  function invalidateCache(key?: string) {
    if (key) {
      schemaCache.delete(key)
    }
    else {
      schemaCache.clear()
    }
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

  const groups = computed(() => {
    const raw = schema.value?.groups ?? []
    return [...raw].sort((a, b) => {
      if (a === 'general') return -1
      if (b === 'general') return 1
      return a.localeCompare(b)
    })
  })

  function getFieldBySlug(fieldSlug: string): Field | undefined {
    return fields.value.find(f => f.slug === fieldSlug)
  }

  function getFieldsByGroup(groupName: string): Field[] {
    return formFields.value.filter(f => f.group_name === groupName)
  }

  // Fetch automat la initializare
  fetchSchema()

  return {
    schema,
    entity,
    fields,
    tableFields,
    formFields,
    filterFields,
    groups,
    loading,
    error,
    fetchSchema,
    invalidateCache,
    getFieldBySlug,
    getFieldsByGroup
  }
}