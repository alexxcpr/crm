<script setup lang="ts">
import type { Field } from '~/types/schema'
import type { TableColumn } from '@nuxt/ui'

const props = defineProps<{
  fields: Field[]
  loading?: boolean
}>()

const emit = defineEmits<{
  add: []
  edit: [field: Field]
  delete: [field: Field]
}>()

const columns: TableColumn<Field>[] = [
  { id: 'edit', header: '', meta: { class: { th: 'w-10', td: 'w-10' } } },
  { accessorKey: 'rank', header: 'Ordine', meta: { class: { th: 'w-20', td: 'w-20' } } },
  { accessorKey: 'name', header: 'Nume' },
  { accessorKey: 'slug', header: 'Slug' },
  { accessorKey: 'column_name', header: 'Coloana' },
  { accessorKey: 'data_type', header: 'Tip date', meta: { class: { th: 'w-32', td: 'w-32' } } },
  { accessorKey: 'ui_type', header: 'Tip UI', meta: { class: { th: 'w-32', td: 'w-32' } } },
  { accessorKey: 'grid_col', header: 'Col nr', meta: { class: { th: 'w-20', td: 'w-20' } } },
  { accessorKey: 'col_span', header: 'Col span', meta: { class: { th: 'w-24', td: 'w-24' } } },
  { id: 'flags', header: 'Proprietati', meta: { class: { th: 'w-48', td: 'w-48' } } },
  { id: 'visibility', header: 'Vizibilitate', meta: { class: { th: 'w-32', td: 'w-32' } } },
  { id: 'actions', header: '', meta: { class: { th: 'w-16', td: 'w-16' } } },
]

const fieldsByGroup = computed(() => {
  const sorted = [...props.fields].sort((a, b) => {
    const ga = a.group_name || 'general'
    const gb = b.group_name || 'general'
    if (ga !== gb)
      return ga.localeCompare(gb)
    return a.rank - b.rank
  })

  const blocks: { group: string, fields: Field[] }[] = []
  for (const f of sorted) {
    const g = f.group_name?.trim() || 'general'
    const last = blocks[blocks.length - 1]
    if (last && last.group === g)
      last.fields.push(f)
    else
      blocks.push({ group: g, fields: [f] })
  }
  return blocks
})

function getDropdownItems(field: Field) {
  return [[{
    label: 'Editeaza',
    icon: 'i-lucide-pencil',
    onClick: () => emit('edit', field)
  }], [{
    label: 'Sterge',
    icon: 'i-lucide-trash-2',
    color: 'error' as const,
    disabled: field.is_system,
    onClick: () => {
      if (!field.is_system) emit('delete', field)
    }
  }]]
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-base font-semibold">Campuri</h3>
      <UButton
        label="Adauga camp"
        icon="i-lucide-plus"
        size="sm"
        @click="emit('add')"
      />
    </div>

    <div v-if="loading && fields.length === 0" class="rounded-lg border border-default overflow-hidden">
      <UTable
        :data="[]"
        :columns="columns"
        :loading="true"
        class="w-full"
        :ui="{ td: 'whitespace-normal wrap-break-word max-w-xs' }"
      />
    </div>

    <div v-else class="space-y-8">
      <section
        v-for="block in fieldsByGroup"
        :key="block.group"
        class="rounded-lg border border-default overflow-hidden bg-elevated/30"
      >
        <div
          class="sticky top-0 z-1 flex items-center gap-2 border-b border-default px-4 py-2.5 bg-default/95 backdrop-blur-sm supports-backdrop-filter:bg-default/80"
        >
          <UIcon name="i-lucide-layout-grid" class="size-4 text-muted shrink-0" />
          <h4 class="text-sm font-semibold text-highlighted truncate">
            {{ block.group }}
          </h4>
          <UBadge
            :label="String(block.fields.length)"
            color="info"
            variant="solid"
            size="sm"
            class="shrink-0"
          />
        </div>

        <UTable
          :data="block.fields"
          :columns="columns"
          :loading="loading"
          class="w-full"
          :ui="{ td: 'whitespace-normal wrap-break-word max-w-xs' }"
        >
          <template #edit-cell="{ row }">
            <UButton
              icon="i-lucide-pencil"
              label="Edit"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="emit('edit', row.original)"
            />
          </template>

          <template #name-cell="{ row }">
            <div class="flex items-center gap-2">
              <span :class="{ 'font-medium': row.original.is_system }">{{ row.original.name }}</span>
              <UBadge
                v-if="row.original.is_system"
                label="System"
                color="warning"
                variant="subtle"
                size="sm"
              />
            </div>
          </template>

          <template #data_type-cell="{ row }">
            <UBadge :label="row.original.data_type" color="neutral" variant="subtle" size="md" />
          </template>

          <template #ui_type-cell="{ row }">
            <UBadge :label="row.original.ui_type" color="info" variant="subtle" size="md" />
          </template>

          <template #flags-cell="{ row }">
            <div class="flex items-center gap-1 flex-wrap">
              <UBadge
                v-if="row.original.is_required"
                label="Required"
                color="error"
                variant="subtle"
                size="sm"
              />
              <UBadge
                v-if="row.original.is_unique"
                label="Unique"
                color="warning"
                variant="subtle"
                size="sm"
              />
              <UBadge
                v-if="row.original.is_filterable"
                label="Filtru"
                color="neutral"
                variant="subtle"
                size="sm"
              />
            </div>
          </template>

          <template #visibility-cell="{ row }">
            <div class="flex items-center gap-1">
              <UTooltip text="Vizibil in tabel">
                <UIcon
                  name="i-lucide-table"
                  class="size-4"
                  :class="row.original.visible_in_table ? 'text-primary' : 'text-muted opacity-30'"
                />
              </UTooltip>
              <UTooltip text="Vizibil in formular">
                <UIcon
                  name="i-lucide-file-text"
                  class="size-4"
                  :class="row.original.visible_in_form ? 'text-primary' : 'text-muted opacity-30'"
                />
              </UTooltip>
            </div>
          </template>

          <template #actions-cell="{ row }">
            <UDropdownMenu :items="getDropdownItems(row.original)">
              <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" size="xs" />
            </UDropdownMenu>
          </template>
        </UTable>
      </section>
    </div>

    <div v-if="!loading && fields.length === 0" class="py-8">
      <UEmpty
        icon="i-lucide-columns-3"
        title="Niciun camp"
        description="Adauga campuri pentru aceasta entitate."
      >
        <template #actions>
          <UButton label="Adauga camp" icon="i-lucide-plus" size="sm" @click="emit('add')" />
        </template>
      </UEmpty>
    </div>
  </div>
</template>
