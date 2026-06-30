import type { Field } from '~/types/schema'

export type RelationOption = {
  label: string
  value: string
}

type RelationOptionsCacheEntry = {
  items: RelationOption[]
  fetchedAt: number
  error: string | null
}

type RelationRecord = Record<string, unknown> & {
  id?: unknown
}

type ApiError = {
  data?: {
    message?: string
  }
  message?: string
}

type RefreshOptions = {
  search?: string
  force?: boolean
  background?: boolean
}

type SeedSelectedRelationOptions = {
  fallbackToValue?: boolean
}

const CACHE_TTL_MS = 60_000
const DEFAULT_LIMIT = 50
const pendingFetches = new Map<string, Promise<RelationOption[]>>()
const activeFetches = new Map<string, symbol>()

export function useRelationOptionsCache() {
  const { apiFetch } = useApi()
  const { slug } = useTenant()

  const cache = useState<Record<string, RelationOptionsCacheEntry>>('relation-options-cache', () => ({}))
  const loading = useState<Record<string, boolean>>('relation-options-loading', () => ({}))

  const tenantKey = computed(() => slug.value || 'default')

  function isRelationField(field: Field): boolean {
    return field.ui_type === 'relation' && !!field.relation_entity_slug
  }

  function getDisplayField(field: Field): string {
    return field.relation_display_field ?? 'name'
  }

  function normalizeSearch(search?: string): string {
    return (search ?? '').trim().toLowerCase()
  }

  function getCacheKey(field: Field, search?: string): string | null {
    if (!isRelationField(field) || !field.relation_entity_slug) return null

    return [
      tenantKey.value,
      field.relation_entity_slug,
      getDisplayField(field),
      normalizeSearch(search)
    ].join('::')
  }

  function getEntityPrefix(entitySlug: string): string {
    return `${tenantKey.value}::${entitySlug}::`
  }

  function getFieldPrefix(field: Field): string | null {
    if (!isRelationField(field) || !field.relation_entity_slug) return null
    return `${tenantKey.value}::${field.relation_entity_slug}::${getDisplayField(field)}::`
  }

  function isFresh(entry?: RelationOptionsCacheEntry): boolean {
    return !!entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS
  }

  function setLoading(key: string, value: boolean) {
    loading.value = {
      ...loading.value,
      [key]: value
    }
  }

  function setCacheEntry(key: string, entry: RelationOptionsCacheEntry) {
    cache.value = {
      ...cache.value,
      [key]: entry
    }
  }

  function upsertOption(items: RelationOption[], option: RelationOption): RelationOption[] {
    const index = items.findIndex(item => item.value === option.value)
    if (index === -1) {
      return [option, ...items]
    }

    const next = [...items]
    next[index] = option
    return next
  }

  function getErrorMessage(err: unknown): string {
    if (typeof err !== 'object' || err === null) {
      return 'Eroare la incarcarea relatiilor'
    }

    const apiError = err as ApiError
    return apiError.data?.message || apiError.message || 'Eroare la incarcarea relatiilor'
  }

  function isRelationOption(record: RelationRecord | RelationOption): record is RelationOption {
    return 'label' in record && 'value' in record
  }

  function buildRelationOption(field: Field, record: RelationRecord | RelationOption): RelationOption | null {
    if (isRelationOption(record)) {
      return {
        label: String(record.label),
        value: String(record.value)
      }
    }

    if (!record.id) return null

    return {
      label: String(record[getDisplayField(field)] ?? record.id),
      value: String(record.id)
    }
  }

  function getRelationOptions(field: Field, search?: string): RelationOption[] {
    const key = getCacheKey(field, search)
    if (!key) return []
    return cache.value[key]?.items ?? []
  }

  function getRelationOptionLabel(field: Field, value: string): string | undefined {
    const prefix = getFieldPrefix(field)
    if (!prefix) return undefined

    for (const [key, entry] of Object.entries(cache.value)) {
      if (!key.startsWith(prefix)) continue
      const option = entry.items.find(item => item.value === value)
      if (option) return option.label
    }

    return undefined
  }

  function isRelationOptionsLoading(field: Field, search?: string): boolean {
    const key = getCacheKey(field, search)
    if (!key) return false
    return loading.value[key] ?? false
  }

  function shouldRefreshRelationOptions(field: Field, search?: string): boolean {
    const key = getCacheKey(field, search)
    if (!key) return false
    return !isFresh(cache.value[key])
  }

  async function refreshRelationOptions(field: Field, options: RefreshOptions = {}): Promise<RelationOption[]> {
    const search = options.search ?? ''
    const key = getCacheKey(field, search)
    if (!key || !field.relation_entity_slug) return []

    const currentEntry = cache.value[key]
    if (!options.force && currentEntry && isFresh(currentEntry)) {
      return currentEntry.items
    }

    const pending = pendingFetches.get(key)
    if (pending) return pending

    const showLoading = !options.background || !currentEntry?.items.length
    if (showLoading) setLoading(key, true)

    const fetchId = Symbol(key)
    activeFetches.set(key, fetchId)

    const promise = (async () => {
      const query: Record<string, string> = { limit: String(DEFAULT_LIMIT) }
      const normalizedSearch = normalizeSearch(search)
      if (normalizedSearch) {
        query[`filter[${getDisplayField(field)}][contains]`] = search.trim()
      }

      const response = await apiFetch<{ data: RelationRecord[] }>(`/v1/data/${field.relation_entity_slug}`, { query })
      const items = response.data.map(record => ({
        label: String(record[getDisplayField(field)] ?? record.id),
        value: String(record.id)
      }))

      if (activeFetches.get(key) === fetchId) {
        setCacheEntry(key, {
          items,
          fetchedAt: Date.now(),
          error: null
        })
      }

      return items
    })()

    pendingFetches.set(key, promise)

    try {
      return await promise
    } catch (err: unknown) {
      if (activeFetches.get(key) === fetchId) {
        setCacheEntry(key, {
          items: currentEntry?.items ?? [],
          fetchedAt: currentEntry?.fetchedAt ?? 0,
          error: getErrorMessage(err)
        })
      }
      throw err
    } finally {
      if (activeFetches.get(key) === fetchId) {
        activeFetches.delete(key)
        pendingFetches.delete(key)
      }
      if (showLoading) setLoading(key, false)
    }
  }

  async function prefetchRelationOptions(fields: Field[], options: Pick<RefreshOptions, 'force'> = {}) {
    const seenKeys = new Set<string>()
    const tasks: Promise<RelationOption[]>[] = []

    for (const field of fields) {
      const key = getCacheKey(field)
      if (!key || seenKeys.has(key)) continue
      seenKeys.add(key)
      tasks.push(refreshRelationOptions(field, { force: options.force, background: true }))
    }

    await Promise.all(tasks)
  }

  function upsertRelationOption(field: Field, record: RelationRecord | RelationOption) {
    const prefix = getFieldPrefix(field)
    if (!prefix) return

    const option = buildRelationOption(field, record)
    if (!option) return

    const nextCache = { ...cache.value }
    const keys = Object.keys(nextCache).filter(key => key.startsWith(prefix))
    const defaultKey = `${prefix}`

    if (!nextCache[defaultKey]) {
      nextCache[defaultKey] = {
        items: [option],
        fetchedAt: Date.now(),
        error: null
      }
    }

    for (const key of keys) {
      const entry = nextCache[key]
      if (!entry) continue
      const hasOption = entry.items.some(item => item.value === option.value)
      const isDefaultList = key === defaultKey
      if (hasOption || isDefaultList) {
        nextCache[key] = {
          ...entry,
          items: upsertOption(entry.items, option),
          fetchedAt: Date.now()
        }
      }
    }

    cache.value = nextCache
  }

  function seedSelectedRelationOptions(
    fields: Field[],
    record: RelationRecord | null | undefined,
    options: SeedSelectedRelationOptions = {}
  ) {
    if (!record) return

    const fallbackToValue = options.fallbackToValue ?? true

    for (const field of fields) {
      if (!isRelationField(field)) continue

      const value = record[field.column_name]
      if (!value) continue

      const displayValue = record[`${field.column_name}_display`]
      if ((displayValue === null || displayValue === undefined || displayValue === '') && !fallbackToValue) {
        continue
      }

      upsertRelationOption(field, {
        label: String(displayValue || value),
        value: String(value)
      })
    }
  }

  function invalidateRelationEntity(entitySlug: string) {
    const prefix = getEntityPrefix(entitySlug)
    for (const key of pendingFetches.keys()) {
      if (key.startsWith(prefix)) {
        pendingFetches.delete(key)
        activeFetches.delete(key)
      }
    }

    cache.value = Object.fromEntries(
      Object.entries(cache.value).filter(([key]) => !key.startsWith(prefix))
    )
    loading.value = Object.fromEntries(
      Object.entries(loading.value).filter(([key]) => !key.startsWith(prefix))
    )
  }

  return {
    getRelationOptions,
    getRelationOptionLabel,
    isRelationOptionsLoading,
    shouldRefreshRelationOptions,
    refreshRelationOptions,
    prefetchRelationOptions,
    upsertRelationOption,
    seedSelectedRelationOptions,
    invalidateRelationEntity
  }
}
