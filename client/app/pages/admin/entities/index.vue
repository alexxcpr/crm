<script setup lang="ts">
import type { AdminEntity, AdminModule } from '~/types/admin'
import type { TableColumn } from '@nuxt/ui'

const { entities, loading, error, fetchEntities, deleteEntity } = useAdminEntities()
const { modules, fetchModules } = useAdminModules()
const toast = useToast()

await Promise.all([fetchEntities(), fetchModules()])

// ─── Filter by module ───
const ALL_MODULES = '_all'
const selectedModuleId = ref<string>(ALL_MODULES)

watch(selectedModuleId, (moduleId) => {
  fetchEntities(moduleId === ALL_MODULES ? undefined : moduleId)
})

const moduleFilterOptions = computed(() => [
  { label: 'Toate modulele', value: ALL_MODULES },
  ...modules.value.map(m => ({ label: m.name, value: m.id_module }))
])

// ─── Modal state ───
const showModal = ref(false)
const editingEntity = ref<AdminEntity | null>(null)

function openCreate() {
  editingEntity.value = null
  showModal.value = true
}

function openEdit(entity: AdminEntity) {
  editingEntity.value = entity
  showModal.value = true
}

function onSaved() {
  showModal.value = false
  editingEntity.value = null
}

// ─── Delete ───
const showDeleteConfirm = ref(false)
const deletingEntity = ref<AdminEntity | null>(null)

function confirmDelete(entity: AdminEntity) {
  if (entity.is_system) {
    toast.add({ title: 'Nu se poate sterge o entitate system', color: 'warning' })
    return
  }
  deletingEntity.value = entity
  showDeleteConfirm.value = true
}

async function onConfirmDelete() {
  if (!deletingEntity.value) return

  const success = await deleteEntity(deletingEntity.value.id_entity)
  if (success) {
    toast.add({ title: 'Entitate stearsa', color: 'success' })
  }
  else {
    toast.add({ title: 'Eroare la stergere', description: error.value ?? '', color: 'error' })
  }

  showDeleteConfirm.value = false
  deletingEntity.value = null
}

// ─── Navigate to detail ───
function goToDetail(entity: AdminEntity) {
  navigateTo(`/admin/entities/${entity.id_entity}`)
}

// ─── Table ───
const columns: TableColumn<AdminEntity>[] = [
  { id: 'edit', meta: { class: { th: 'w-10', td: 'w-10' } } },
  { id: 'open', meta: { class: { th: 'w-10', td: 'w-10' } } },
  { accessorKey: 'name', header: 'Nume' },
  { accessorKey: 'slug', header: 'Slug' },
  { accessorKey: 'table_name', header: 'Tabela' },
  { id: 'module', header: 'Modul' },
  { accessorKey: 'is_system', header: 'System' },
  { accessorKey: 'rank', header: 'Ordine' },
  { id: 'actions', header: '' }
]

function getModuleName(moduleId: string | null): string {
  if (!moduleId) return '-'
  const mod = modules.value.find(m => m.id_module === moduleId)
  return mod?.name ?? '-'
}

function getDropdownItems(entity: AdminEntity) {
  return [[{
    label: 'Deschide',
    icon: 'i-lucide-external-link',
    onClick: () => goToDetail(entity)
  }, {
    label: 'Editeaza',
    icon: 'i-lucide-pencil',
    onClick: () => openEdit(entity)
  }], [{
    label: 'Sterge',
    icon: 'i-lucide-trash-2',
    color: 'error' as const,
    disabled: entity.is_system,
    onClick: () => confirmDelete(entity)
  }]]
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-lg font-semibold">Entitati</h2>
        <p class="text-sm text-muted">Gestioneaza entitatile si campurile lor</p>
      </div>
      <div class="flex items-center gap-3">
        <USelect
          v-model="selectedModuleId"
          :items="moduleFilterOptions"
          value-key="value"
          class="w-48"
        />
        <UButton
          label="Adauga entitate"
          icon="i-lucide-plus"
          @click="openCreate"
        />
      </div>
    </div>

    <UTable
      :data="entities"
      :columns="columns"
      :loading="loading"
      class="w-full"
    >
      <!-- Butonul Edit -->
      <template #edit-cell="{ row }">
        <UButton
          icon="i-lucide-pencil"
          label="Edit"
          color="neutral"
          variant="ghost"
          size="xs"
          @click="openEdit(row.original)"
        />
      </template>

      <!-- Butonul Deschide -->
      <template #open-cell="{ row }">
        <UButton
          icon="i-lucide-external-link"
          label="Deschide"
          color="neutral"
          variant="ghost"
          size="xs"
          @click="goToDetail(row.original)"
        />
      </template>

      <template #module-cell="{ row }">
        <span>{{ getModuleName(row.original.id_module) }}</span>
      </template>

      <template #is_system-cell="{ row }">
        <UBadge
          v-if="row.original.is_system"
          label="System"
          color="warning"
          variant="subtle"
          size="sm"
        />
      </template>

      <template #actions-cell="{ row }">
        <UDropdownMenu :items="getDropdownItems(row.original)">
          <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" />
        </UDropdownMenu>
      </template>
    </UTable>

    <div v-if="!loading && entities.length === 0" class="py-12">
      <UEmpty
        icon="i-lucide-database"
        title="Nicio entitate"
        description="Creeaza prima entitate pentru a incepe."
      >
        <template #actions>
          <UButton label="Adauga entitate" icon="i-lucide-plus" @click="openCreate" />
        </template>
      </UEmpty>
    </div>

    <!-- Create/Edit Modal -->
    <UModal
      v-model:open="showModal"
      :title="editingEntity ? 'Editeaza entitate' : 'Entitate noua'"
    >
      <template #body>
        <AdminEntityForm
          :entity="editingEntity"
          :modules="modules"
          @saved="onSaved"
          @cancel="showModal = false"
        />
      </template>
    </UModal>

    <!-- Delete Confirm Modal -->
    <UModal
      v-model:open="showDeleteConfirm"
      title="Confirmare stergere"
      description="Aceasta actiune va sterge tabela SQL asociata si toate datele din ea."
    >
      <template #body>
        <p>
          Esti sigur ca vrei sa stergi entitatea
          <strong>{{ deletingEntity?.name }}</strong>?
        </p>
        <div class="flex items-center gap-3 justify-end mt-4">
          <UButton
            label="Anuleaza"
            color="neutral"
            variant="outline"
            @click="showDeleteConfirm = false"
          />
          <UButton
            label="Sterge"
            color="error"
            icon="i-lucide-trash-2"
            :loading="loading"
            @click="onConfirmDelete"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
