<script setup lang="ts">
import type { Field } from '~/types/schema'
import { INLINE_CREATE_DEPTH_KEY, MAX_INLINE_CREATE_DEPTH } from '~/utils/inlineCreate'

const props = defineProps<{
  field: Field
  modelValue: string | null | undefined
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

// ─── Inline-create ───
const inlineCreateDepth = inject(INLINE_CREATE_DEPTH_KEY, 0)
const entitySlug = computed(() => props.field.relation_entity_slug)
const showInlineCreate = computed(() =>
  inlineCreateDepth <= MAX_INLINE_CREATE_DEPTH
  && !!entitySlug.value
  && !props.disabled
)
const inlineCreateOpen = ref(false)
// entitySlug garantat non-null când showInlineCreate e true (verificat de v-if)
const inlineCreateEntitySlug = computed(() => entitySlug.value!)

const {
  getRelationOptions,
  isRelationOptionsLoading,
  shouldRefreshRelationOptions,
  refreshRelationOptions,
  upsertRelationOption
} = useRelationOptionsCache()

const searchQuery = ref('')
const open = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  if (shouldRefreshRelationOptions(props.field, searchQuery.value)) {
    refreshOptions(searchQuery.value, items.value.length > 0)
  }
})

const items = computed(() => getRelationOptions(props.field, searchQuery.value))
const loading = computed(() => isRelationOptionsLoading(props.field, searchQuery.value))

function onInlineCreated(record: Record<string, unknown>) {
  if (!record.id) return
  upsertRelationOption(props.field, record)
  searchQuery.value = ''
  emit('update:modelValue', String(record.id))
}

function refreshOptions(search?: string, background = false) {
  refreshRelationOptions(props.field, { search, background }).catch((err) => {
    console.error('[RelationSelect] Eroare la incarcarea optiunilor:', err)
  })
}

watch(() => props.modelValue, (newVal) => {
  if (newVal && open.value && shouldRefreshRelationOptions(props.field, searchQuery.value)) {
    refreshOptions(searchQuery.value, items.value.length > 0)
  }
}, { immediate: true })

let debounceTimer: ReturnType<typeof setTimeout> | undefined
function onSearch(query: string) {
  searchQuery.value = query
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    if (shouldRefreshRelationOptions(props.field, query)) {
      refreshOptions(query, getRelationOptions(props.field, query).length > 0)
    }
  }, 300)
}

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})

function onUpdate(val: string | string[] | undefined) {
  if (Array.isArray(val)) {
    emit('update:modelValue', val[0] ?? null)
  } else {
    emit('update:modelValue', val ?? null)
  }
}
</script>

<template>
  <div class="w-full min-w-0">
    <div class="flex items-center gap-1.5">
      <USelectMenu
        v-model:open="open"
        :model-value="modelValue ?? undefined"
        :items="items"
        value-key="value"
        :loading="loading"
        :placeholder="field.placeholder ?? `Selecteaza ${field.name.toLowerCase()}...`"
        :search-input="{ placeholder: 'Cauta...' }"
        :disabled="disabled"
        class="flex-1 min-w-0"
        :clear="!disabled"
        @update:model-value="onUpdate"
        @update:search-term="onSearch"
      />
      <UButton
        v-if="showInlineCreate"
        icon="i-lucide-plus"
        color="primary"
        variant="outline"
        size="sm"
        class="shrink-0"
        :title="`Crează ${field.name.toLowerCase()}`"
        @click="inlineCreateOpen = true"
      />
    </div>

    <DynamicInlineCreateModal
      v-if="showInlineCreate"
      v-model:open="inlineCreateOpen"
      :entity-slug="inlineCreateEntitySlug"
      :entity-label="field.name"
      @created="onInlineCreated"
    />
  </div>
</template>
