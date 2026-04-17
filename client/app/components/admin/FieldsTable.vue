<script setup lang="ts">
import type { Field } from '~/types/schema'
import type { TableColumn } from '@nuxt/ui'

defineProps<{
  fields: Field[]
  loading?: boolean
}>()

const emit = defineEmits<{
  add: []
  edit: [field: Field]
  delete: [field: Field]
}>()

const columns: TableColumn<Field>[] = [
  { accessorKey: 'rank', header: '#' },
  { accessorKey: 'name', header: 'Nume' },
  { accessorKey: 'slug', header: 'Slug' },
  { accessorKey: 'column_name', header: 'Coloana' },
  { accessorKey: 'data_type', header: 'Tip date' },
  { accessorKey: 'ui_type', header: 'Tip UI' },
  { id: 'flags', header: 'Proprietati' },
  { id: 'visibility', header: 'Vizibilitate' },
  { id: 'actions', header: '' }
]

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

    <UTable
      :data="fields"
      :columns="columns"
      :loading="loading"
      class="w-full"
    >
      <template #name-cell="{ row }">
        <div class="flex items-center gap-2">
          <span :class="{ 'font-medium': row.original.is_system }">{{ row.original.name }}</span>
          <UBadge
            v-if="row.original.is_system"
            label="System"
            color="warning"
            variant="subtle"
            size="xs"
          />
        </div>
      </template>

      <template #data_type-cell="{ row }">
        <UBadge :label="row.original.data_type" color="neutral" variant="subtle" size="sm" />
      </template>

      <template #ui_type-cell="{ row }">
        <UBadge :label="row.original.ui_type" color="info" variant="subtle" size="sm" />
      </template>

      <template #flags-cell="{ row }">
        <div class="flex items-center gap-1 flex-wrap">
          <UBadge
            v-if="row.original.is_required"
            label="Required"
            color="error"
            variant="subtle"
            size="xs"
          />
          <UBadge
            v-if="row.original.is_unique"
            label="Unique"
            color="warning"
            variant="subtle"
            size="xs"
          />
          <UBadge
            v-if="row.original.is_filterable"
            label="Filtru"
            color="neutral"
            variant="subtle"
            size="xs"
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
