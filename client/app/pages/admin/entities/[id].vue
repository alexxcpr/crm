<script setup lang="ts">
import type { Field } from '~/types/schema'
import type { AdminEntity } from '~/types/admin'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const entityId = computed(() => route.params.id as string)

// ─── Data loading ───
const { fetchEntity } = useAdminEntities()
const { fields, loading: fieldsLoading, fetchFields, deleteField, error: fieldsError } = useAdminFields(entityId)
const { modules, fetchModules } = useAdminModules()
const { entities, fetchEntities } = useAdminEntities()

const entity = ref<AdminEntity | null>(null)
const pageLoading = ref(true)

async function loadData() {
  pageLoading.value = true
  try {
    const [entityData] = await Promise.all([
      fetchEntity(entityId.value),
      fetchFields(),
      fetchModules(),
      fetchEntities()
    ])
    entity.value = entityData
  } finally {
    pageLoading.value = false
  }
}

loadData()

// ─── Entity edit modal ───
const showEntityModal = ref(false)

function onEntitySaved(updated: AdminEntity) {
  entity.value = updated
  showEntityModal.value = false
}

// ─── Field slideover ───
const showFieldSlideover = ref(false)
const editingField = ref<Field | null>(null)

function openAddField() {
  editingField.value = null
  showFieldSlideover.value = true
}

function openEditField(field: Field) {
  editingField.value = field
  showFieldSlideover.value = true
}

function onFieldSaved() {
  showFieldSlideover.value = false
  editingField.value = null
}

// ─── Field delete ───
const showDeleteConfirm = ref(false)
const deletingField = ref<Field | null>(null)

function confirmDeleteField(field: Field) {
  if (field.is_system) {
    toast.add({ title: 'Nu se poate sterge un camp system', color: 'warning' })
    return
  }
  deletingField.value = field
  showDeleteConfirm.value = true
}

async function onConfirmDeleteField() {
  if (!deletingField.value) return

  const success = await deleteField(deletingField.value.id_field)
  if (success) {
    toast.add({ title: 'Camp sters', color: 'success' })
  }
  else {
    toast.add({ title: 'Eroare la stergere', description: fieldsError.value ?? '', color: 'error' })
  }

  showDeleteConfirm.value = false
  deletingField.value = null
}

// ─── Module name helper ───
function getModuleName(moduleId: string | null): string {
  if (!moduleId) return '-'
  const mod = modules.value.find(m => m.id_module === moduleId)
  return mod?.name ?? '-'
}
</script>

<template>
  <div>
    <!-- Loading -->
    <div v-if="pageLoading" class="space-y-6 p-4">
      <USkeleton class="h-8 w-64" />
      <USkeleton class="h-32 w-full" />
      <USkeleton class="h-64 w-full" />
    </div>

    <!-- Not found -->
    <div v-else-if="!entity" class="py-12">
      <UEmpty
        icon="i-lucide-alert-triangle"
        title="Entitate negasita"
        description="Entitatea cautata nu exista."
      >
        <template #actions>
          <UButton label="Inapoi" icon="i-lucide-arrow-left" @click="router.push('/admin/entities')" />
        </template>
      </UEmpty>
    </div>

    <div v-else class="space-y-6">
    <!-- Back button + title -->
    <div class="flex items-center gap-3">
      <UButton
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="router.push('/admin/entities')"
      />
      <div class="flex-1">
        <h2 class="text-lg font-semibold flex items-center gap-2">
          <UIcon v-if="entity.icon" :name="entity.icon" class="size-5" />
          {{ entity.name }}
          <UBadge v-if="entity.is_system" label="System" color="warning" variant="subtle" size="sm" />
        </h2>
        <p class="text-sm text-muted">{{ entity.slug }} &middot; {{ entity.table_name }}</p>
      </div>
      <UButton
        label="Editeaza entitate"
        icon="i-lucide-pencil"
        variant="outline"
        color="neutral"
        size="sm"
        @click="showEntityModal = true"
      />
    </div>

    <!-- Entity info card -->
    <UPageCard variant="subtle">
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div>
          <div class="text-xs text-muted uppercase mb-1">Modul</div>
          <div class="font-medium">{{ getModuleName(entity.id_module) }}</div>
        </div>
        <div>
          <div class="text-xs text-muted uppercase mb-1">Label singular</div>
          <div class="font-medium">{{ entity.label_singular || '-' }}</div>
        </div>
        <div>
          <div class="text-xs text-muted uppercase mb-1">Label plural</div>
          <div class="font-medium">{{ entity.label_plural || '-' }}</div>
        </div>
        <div>
          <div class="text-xs text-muted uppercase mb-1">Ordine</div>
          <div class="font-medium">{{ entity.rank }}</div>
        </div>
      </div>
    </UPageCard>

    <!-- Fields table -->
    <AdminFieldsTable
      :fields="fields"
      :loading="fieldsLoading"
      @add="openAddField"
      @edit="openEditField"
      @delete="confirmDeleteField"
    />

    <!-- Entity Edit Modal -->
    <UModal v-model:open="showEntityModal" title="Editeaza entitate">
      <template #body>
        <AdminEntityForm
          :entity="entity"
          :modules="modules"
          @saved="onEntitySaved"
          @cancel="showEntityModal = false"
        />
      </template>
    </UModal>

    <!-- Field Slideover -->
    <USlideover
      v-model:open="showFieldSlideover"
      :title="editingField ? 'Editeaza camp' : 'Camp nou'"
      :ui="{ width: 'max-w-lg' }"
    >
      <template #body>
        <AdminFieldForm
          :entity-id="entityId"
          :field="editingField"
          :entities="entities"
          @saved="onFieldSaved"
          @cancel="showFieldSlideover = false"
        />
      </template>
    </USlideover>

    <!-- Delete Field Confirm -->
    <UModal
      v-model:open="showDeleteConfirm"
      title="Confirmare stergere camp"
      description="Datele existente din aceasta coloana vor fi pierdute."
    >
      <template #body>
        <p>
          Esti sigur ca vrei sa stergi campul
          <strong>{{ deletingField?.name }}</strong>?
        </p>
        <p class="text-sm text-muted mt-1">
          Coloana <code class="text-xs bg-elevated px-1 py-0.5 rounded">{{ deletingField?.column_name }}</code> va fi stearsa din tabela SQL.
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
            :loading="fieldsLoading"
            @click="onConfirmDeleteField"
          />
        </div>
      </template>
    </UModal>
    </div>
  </div>
</template>
