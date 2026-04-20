<script setup lang="ts">
import type { AdminModule } from '~/types/admin'
import type { TableColumn } from '@nuxt/ui'

const { modules, loading, error, fetchModules, deleteModule } = useAdminModules()
const toast = useToast()

await fetchModules()

// ─── Modal state ───
const showModal = ref(false)
const editingModule = ref<AdminModule | null>(null)

function openCreate() {
  editingModule.value = null
  showModal.value = true
}

function openEdit(mod: AdminModule) {
  editingModule.value = mod
  showModal.value = true
}

function onSaved() {
  showModal.value = false
  editingModule.value = null
}

// ─── Delete ───
const showDeleteConfirm = ref(false)
const deletingModule = ref<AdminModule | null>(null)

function confirmDelete(mod: AdminModule) {
  deletingModule.value = mod
  showDeleteConfirm.value = true
}

async function onConfirmDelete() {
  if (!deletingModule.value) return

  const success = await deleteModule(deletingModule.value.id_module)
  if (success) {
    toast.add({ title: 'Modul sters', color: 'success' })
  }
  else {
    toast.add({ title: 'Eroare la stergere', description: error.value ?? '', color: 'error' })
  }

  showDeleteConfirm.value = false
  deletingModule.value = null
}

// ─── Table ───
const columns: TableColumn<AdminModule>[] = [
  { id: 'edit', meta: { class: { th: 'w-10', td: 'w-10' } } },
  { accessorKey: 'name', header: 'Nume' },
  { accessorKey: 'slug', header: 'Slug' },
  { accessorKey: 'icon', header: 'Icon' },
  { accessorKey: 'rank', header: 'Ordine' },
  { accessorKey: 'is_active', header: 'Activ' },
  { id: 'actions', header: '' }
]

function getDropdownItems(mod: AdminModule) {
  return [[{
    label: 'Editeaza',
    icon: 'i-lucide-pencil',
    onClick: () => openEdit(mod)
  }], [{
    label: 'Sterge',
    icon: 'i-lucide-trash-2',
    color: 'error' as const,
    onClick: () => confirmDelete(mod)
  }]]
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-lg font-semibold">Module</h2>
        <p class="text-sm text-muted">Grupeaza entitatile in module logice (CRM, ERP, etc.)</p>
      </div>
      <UButton
        label="Adauga modul"
        icon="i-lucide-plus"
        @click="openCreate"
      />
    </div>

    <UTable
      :data="modules"
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

      <template #icon-cell="{ row }">
        <div v-if="row.original.icon" class="flex items-center gap-2">
          <UIcon :name="row.original.icon" class="size-4" />
          <span class="text-xs text-muted">{{ row.original.icon }}</span>
        </div>
        <span v-else class="text-muted">-</span>
      </template>

      <template #is_active-cell="{ row }">
        <UBadge
          :label="row.original.is_active ? 'Activ' : 'Inactiv'"
          :color="row.original.is_active ? 'success' : 'neutral'"
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

    <div v-if="!loading && modules.length === 0" class="py-12">
      <UEmpty
        icon="i-lucide-boxes"
        title="Niciun modul"
        description="Creeaza primul modul pentru a incepe."
      >
        <template #actions>
          <UButton label="Adauga modul" icon="i-lucide-plus" @click="openCreate" />
        </template>
      </UEmpty>
    </div>

    <!-- Create/Edit Modal -->
    <UModal
      v-model:open="showModal"
      :title="editingModule ? 'Editeaza modul' : 'Modul nou'"
    >
      <template #body>
        <AdminModuleForm
          :module="editingModule"
          @saved="onSaved"
          @cancel="showModal = false"
        />
      </template>
    </UModal>

    <!-- Delete Confirm Modal -->
    <UModal
      v-model:open="showDeleteConfirm"
      title="Confirmare stergere"
      description="Aceasta actiune va sterge si toate entitatile asociate."
    >
      <template #body>
        <p>
          Esti sigur ca vrei sa stergi modulul
          <strong>{{ deletingModule?.name }}</strong>?
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
