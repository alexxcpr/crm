<script setup lang="ts">
import type { Field } from '~/types/schema'

const props = defineProps<{
  field: Field
  modelValue: string | null | undefined
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

const { apiFetch } = useApi()

const items = ref<{ label: string; value: string }[]>([])
const loading = ref(false)
const searchQuery = ref('')

const entitySlug = computed(() => props.field.relation_entity_slug)
const displayField = computed(() => props.field.relation_display_field ?? 'name')

async function fetchOptions(search?: string) {
  if (!entitySlug.value) return

  loading.value = true
  try {
    const query: Record<string, string> = { limit: '50' }
    if (search) {
      query[`filter[${displayField.value}][contains]`] = search
    }

    const response = await apiFetch<{ data: Record<string, any>[] }>(`/v1/data/${entitySlug.value}`, { query })

    items.value = response.data.map(record => ({
      label: String(record[displayField.value] ?? record.id),
      value: record.id
    }))
  }
  catch (err) {
    console.error('[RelationSelect] Eroare la incarcarea optiunilor:', err)
    items.value = []
  }
  finally {
    loading.value = false
  }
}

let debounceTimer: ReturnType<typeof setTimeout>
function onSearch(query: string) {
  searchQuery.value = query
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => fetchOptions(query), 300)
}

function onUpdate(val: string | string[] | undefined) {
  if (Array.isArray(val)) {
    emit('update:modelValue', val[0] ?? null)
  }
  else {
    emit('update:modelValue', val ?? null)
  }
}

fetchOptions()
</script>

<template>
  <USelectMenu
    :model-value="modelValue ?? undefined"
    :items="items"
    value-key="value"
    :loading="loading"
    :placeholder="field.placeholder ?? `Selecteaza ${field.name.toLowerCase()}...`"
    :search-input="{ placeholder: 'Cauta...' }"
    clear
    @update:model-value="onUpdate"
    @update:search-term="onSearch"
  />
</template>
