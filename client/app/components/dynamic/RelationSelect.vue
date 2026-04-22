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
const open = ref(false)
const hasFetchedOptions = ref(false)

watch(open, (isOpen) => {
  if (isOpen && !hasFetchedOptions.value) {
    fetchOptions()
  }
})

const entitySlug = computed(() => props.field.relation_entity_slug)
const displayField = computed(() => props.field.relation_display_field ?? 'name')

async function fetchSelectedValue() {
  if (!props.modelValue || !entitySlug.value) return

  const existing = items.value.find(i => i.value === props.modelValue)
  if (existing && existing.label !== 'Se incarca...') return

  loading.value = true
  try {
    const response = await apiFetch<{ data: Record<string, any> }>(`/v1/data/${entitySlug.value}/${props.modelValue}`)
    
    if (response.data) {
      // Daca items avea deja ceva, putem sa il adaugam in loc sa suprascriem, sau suprascriem 
      // pentru ca fetchOptions va suprascrie la deschiderea dropdown-ului
      const newItem = {
        label: String(response.data[displayField.value] ?? response.data.id),
        value: response.data.id
      }
      
      const exists = items.value.findIndex(i => i.value === newItem.value)
      if (exists !== -1) {
        items.value[exists] = newItem
      } else {
        items.value.push(newItem)
      }
    }
  }
  catch (err) {
    console.error('[RelationSelect] Eroare la incarcarea valorii selectate:', err)
  }
  finally {
    loading.value = false
  }
}

watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    const existing = items.value.find(i => i.value === newVal)
    if (!existing) {
      items.value.push({ label: 'Se incarca...', value: newVal })
    }
    fetchSelectedValue()
  }
}, { immediate: true })

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
    hasFetchedOptions.value = true
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
</script>

<template>
  <div class="w-full min-w-0">
    <USelectMenu
      :model-value="modelValue ?? undefined"
      :items="items"
      value-key="value"
      :loading="loading"
      :placeholder="field.placeholder ?? `Selecteaza ${field.name.toLowerCase()}...`"
      :search-input="{ placeholder: 'Cauta...' }"
      class="w-full"
      clear
      @update:model-value="onUpdate"
      @update:search-term="onSearch"
      v-model:open="open"
    />
  </div>
</template>
