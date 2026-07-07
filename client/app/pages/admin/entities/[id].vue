<script setup lang="ts">
import type { Field, UiTab } from '~/types/schema'
import type { AdminEntity, AdminTab } from '~/types/admin'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const entityId = computed(() => route.params.id as string)
const entity = ref<AdminEntity | null>(null)
const entitySlug = computed(() => entity.value?.slug ?? null)

// ─── Data loading ───
const { fetchEntity } = useAdminEntities()
const { fields, loading: fieldsLoading, fetchFields, deleteField, error: fieldsError } = useAdminFields(entityId, entitySlug)
const { modules, fetchModules } = useAdminModules()
const { entities, fetchEntities } = useAdminEntities()
const { tabs, loading: tabsLoading, fetchTabs, deleteTab, error: tabsError } = useAdminTabs(entityId, entitySlug)

const pageLoading = ref(true)

async function loadData() {
  pageLoading.value = true
  try {
    const [entityData] = await Promise.all([
      fetchEntity(entityId.value),
      fetchFields(),
      fetchModules(),
      fetchEntities(),
      fetchTabs()
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

async function onFieldSaved() {
  showFieldSlideover.value = false
  editingField.value = null
  await fetchFields()
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
  } else {
    toast.add({ title: 'Eroare la stergere', description: fieldsError.value ?? '', color: 'error' })
  }

  showDeleteConfirm.value = false
  deletingField.value = null
}

// ─── Tab management ───
const showTabModal = ref(false)
const editingTab = ref<AdminTab | null>(null)

function openAddTab() {
  editingTab.value = null
  showTabModal.value = true
}

function openEditTab(tab: AdminTab) {
  editingTab.value = tab
  showTabModal.value = true
}

async function onTabSaved() {
  showTabModal.value = false
  editingTab.value = null
  await fetchTabs()
}

const showTabDeleteConfirm = ref(false)
const deletingTab = ref<AdminTab | null>(null)

function confirmDeleteTab(tab: AdminTab) {
  if (tab.is_system) {
    toast.add({ title: 'Tab-ul system nu poate fi sters', color: 'warning' })
    return
  }
  deletingTab.value = tab
  showTabDeleteConfirm.value = true
}

async function onConfirmDeleteTab() {
  if (!deletingTab.value) return

  const success = await deleteTab(deletingTab.value.id_ui_tab)
  if (success) {
    toast.add({ title: 'Tab sters', color: 'success' })
  } else {
    toast.add({ title: 'Eroare la stergere', description: tabsError.value ?? '', color: 'error' })
  }

  showTabDeleteConfirm.value = false
  deletingTab.value = null
}

// ─── Tab options for FieldForm ───
const tabOptions = computed<UiTab[]>(() =>
  tabs.value.map(t => ({
    id_ui_tab: t.id_ui_tab,
    id_entity: t.id_entity,
    name: t.name,
    slug: t.slug,
    rank: t.rank,
    is_system: t.is_system,
    date_created: t.date_created,
    date_updated: t.date_updated
  }))
)

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
            <UBadge
              v-if="entity.is_system"
              label="System"
              color="warning"
              variant="subtle"
              size="sm"
            />
          </h2>
          <p class="text-sm text-muted">
            {{ entity.slug }} &middot; {{ entity.table_name }}
          </p>
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
            <div class="text-xs text-muted uppercase mb-1">
              Modul
            </div>
            <div class="font-medium">
              {{ getModuleName(entity.id_module) }}
            </div>
          </div>
          <div>
            <div class="text-xs text-muted uppercase mb-1">
              Label singular
            </div>
            <div class="font-medium">
              {{ entity.label_singular || '-' }}
            </div>
          </div>
          <div>
            <div class="text-xs text-muted uppercase mb-1">
              Label plural
            </div>
            <div class="font-medium">
              {{ entity.label_plural || '-' }}
            </div>
          </div>
          <div>
            <div class="text-xs text-muted uppercase mb-1">
              Ordine
            </div>
            <div class="font-medium">
              {{ entity.rank }}
            </div>
          </div>
        </div>
      </UPageCard>

      <!-- Tabs management -->
      <UPageCard variant="subtle">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-base font-semibold">
            Tab-uri
          </h3>
          <UButton
            label="Adauga tab"
            icon="i-lucide-plus"
            size="sm"
            @click="openAddTab"
          />
        </div>

        <div v-if="tabs.length === 0 && !tabsLoading" class="text-sm text-muted py-4 text-center">
          Niciun tab creat. Tab-urile controleaza cum sunt grupate campurile in formular.
        </div>

        <div v-if="tabsLoading" class="space-y-2">
          <USkeleton v-for="i in 2" :key="i" class="h-12 w-full" />
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="tab in tabs"
            :key="tab.id_ui_tab"
            class="flex items-center gap-3 p-3 rounded-lg border border-default bg-elevated/30"
          >
            <UIcon name="i-lucide-folder" class="size-5 text-muted shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="font-medium truncate">
                {{ tab.name }}
              </div>
              <div class="text-xs text-muted">
                {{ tab.slug }}
              </div>
            </div>
            <UBadge
              v-if="tab.is_system"
              label="System"
              color="warning"
              variant="subtle"
              size="sm"
            />
            <UBadge
              :label="String(tab.rank)"
              color="neutral"
              variant="subtle"
              size="sm"
            />
            <div class="flex items-center gap-1">
              <UButton
                icon="i-lucide-pencil"
                color="neutral"
                variant="ghost"
                size="xs"
                @click="openEditTab(tab)"
              />
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="xs"
                :disabled="tab.is_system"
                @click="confirmDeleteTab(tab)"
              />
            </div>
          </div>
        </div>
      </UPageCard>

      <!-- Fields table -->
      <AdminFieldsTable
        :fields="fields"
        :tabs="tabOptions"
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
        :ui="{ content: 'max-w-lg' }"
      >
        <template #body>
          <AdminFieldForm
            :entity-id="entityId"
            :entity-slug="entitySlug"
            :field="editingField"
            :entities="entities"
            :tabs="tabOptions"
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

      <!-- Tab Create/Edit Modal -->
      <UModal v-model:open="showTabModal" :title="editingTab ? 'Editeaza tab' : 'Tab nou'">
        <template #body>
          <AdminTabForm
            :entity-id="entityId"
            :entity-slug="entitySlug"
            :tab="editingTab"
            @saved="onTabSaved"
            @cancel="showTabModal = false"
          />
        </template>
      </UModal>

      <!-- Delete Tab Confirm -->
      <UModal
        v-model:open="showTabDeleteConfirm"
        title="Confirmare stergere tab"
      >
        <template #body>
          <p>
            Esti sigur ca vrei sa stergi tab-ul
            <strong>{{ deletingTab?.name }}</strong>?
          </p>
          <div class="flex items-center gap-3 justify-end mt-4">
            <UButton
              label="Anuleaza"
              color="neutral"
              variant="outline"
              @click="showTabDeleteConfirm = false"
            />
            <UButton
              label="Sterge"
              color="error"
              icon="i-lucide-trash-2"
              :loading="tabsLoading"
              @click="onConfirmDeleteTab"
            />
          </div>
        </template>
      </UModal>
    </div>
  </div>
</template>
