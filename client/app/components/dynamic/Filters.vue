<script setup lang="ts">
import type { Field } from '~/types/schema'

const props = defineProps<{
  fields: Field[]
}>()

const emit = defineEmits<{
  change: [filters: Record<string, any>]
}>()

const searchText = ref('')
const selectFilters = ref<Record<string, string>>({})

const searchField = computed(() =>
  props.fields.find(f => ['text', 'email', 'phone'].includes(f.ui_type))
)

const dropdownFields = computed(() =>
  props.fields.filter(f => f.ui_type === 'select' || f.ui_type === 'checkbox')
)

function getFilterItems(field: Field) {
  const allOption = { label: 'Toate', value: '__all__' }

  if (field.ui_type === 'select' && field.options) {
    return [allOption, ...field.options]
  }
  if (field.ui_type === 'checkbox') {
    return [allOption, { label: 'Da', value: 'true' }, { label: 'Nu', value: 'false' }]
  }
  return [allOption]
}

function buildAndEmitFilters() {
  const filters: Record<string, any> = {}

  if (searchText.value && searchField.value) {
    filters[searchField.value.column_name] = { contains: searchText.value }
  }

  for (const [columnName, value] of Object.entries(selectFilters.value)) {
    if (value && value !== '__all__') {
      filters[columnName] = value
    }
  }

  emit('change', filters)
}

let debounceTimer: ReturnType<typeof setTimeout>
watch(searchText, () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(buildAndEmitFilters, 300)
})

watch(selectFilters, buildAndEmitFilters, { deep: true })

const hasActiveFilters = computed(() =>
  searchText.value !== '' || Object.values(selectFilters.value).some(v => v !== '' && v !== '__all__')
)

function clearAll() {
  searchText.value = ''
  selectFilters.value = {}
  emit('change', {})
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5">
    <UInput
      v-if="searchField"
      v-model="searchText"
      icon="i-lucide-search"
      :placeholder="`Cauta dupa ${searchField.name.toLowerCase()}...`"
      class="max-w-sm"
    />

    <USelect
      v-for="field in dropdownFields"
      :key="field.id_field"
      :model-value="selectFilters[field.column_name] ?? ''"
      :items="getFilterItems(field)"
      :placeholder="field.name"
      class="min-w-28"
      :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200' }"
      @update:model-value="(val: string) => { selectFilters[field.column_name] = val }"
    />

    <UButton
      v-if="hasActiveFilters"
      icon="i-lucide-x"
      color="neutral"
      variant="ghost"
      size="sm"
      label="Reseteaza"
      @click="clearAll"
    />
  </div>
</template>