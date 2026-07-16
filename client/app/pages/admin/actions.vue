<script setup lang="ts">
import { h } from 'vue'
import type { TableColumn } from '@nuxt/ui'

const UCheckbox = resolveComponent('UCheckbox')

const { actions, loading, error, fetchActions, createAction, updateAction, deleteAction, deleteActions } = useAdminActions()
const { entities, fetchEntities } = useAdminEntities()
const { workflows, fetchWorkflows } = useAdminWorkflows()
const toast = useToast()
const actionsTableRoot = ref<HTMLElement | null>(null)
const { savingRank, persistRankOrder } = useRankReorder()

onMounted(() => {
  fetchActions()
  fetchEntities()
  fetchWorkflows()
})

// ─── Filter by entity ───
const selectedEntityId = ref<string>('')
const canReorder = computed(() => Boolean(selectedEntityId.value))

const filteredActions = computed(() => {
  const allActions = actions.value || []
  if (!selectedEntityId.value) return allActions
  return allActions.filter(a => a.id_entity === selectedEntityId.value)
})

function parseTriggerEvents(events: any): string[] {
  if (!events) return []
  if (typeof events === 'string') {
    try {
      return JSON.parse(events)
    } catch {
      return []
    }
  }
  return Array.isArray(events) ? events : []
}

watch(selectedEntityId, (val) => {
  fetchActions(val || undefined)
})

useRankedTableDrag(actionsTableRoot, {
  async onReorder(_group, oldIndex, newIndex) {
    if (!canReorder.value) return
    const previous = [...actions.value]
    actions.value = normalizeRankOrder(moveRankedItem(filteredActions.value, oldIndex, newIndex))
    try {
      actions.value = await persistRankOrder(
        '/v1/admin/actions/reorder/ranks',
        actions.value,
        action => action.id_action
      )
    } catch (err: any) {
      actions.value = previous
      toast.add({
        title: 'Ordinea nu a putut fi salvata',
        description: err?.data?.message || err.message,
        color: 'error'
      })
    }
  }
})

// ─── Create/Edit Modal ───
const showModal = ref(false)
const editingAction = ref<any>(null)

const formName = ref('')
const formSlug = ref('')
const formEntityId = ref('')
const formWorkflowId = ref('')
const formDescription = ref('')
const formShowInUi = ref(true)
const formIsActive = ref(true)
const formTriggerEvents = ref<string[]>([])

const entityOptions = computed(() =>
  (entities.value || []).map(e => ({ label: e.name, value: e.id_entity }))
)

const workflowOptions = computed(() => [
  { label: '(Fara workflow)', value: 'none' },
  ...(workflows.value || []).map(w => ({ label: w.name, value: w.id_workflow }))
])

const triggerEventOptions = [
  { label: 'Dupa creare', value: 'entity.after_insert' },
  { label: 'Dupa actualizare', value: 'entity.after_update' },
  { label: 'Dupa stergere', value: 'entity.after_delete' },
  { label: 'Inainte de creare', value: 'entity.before_insert' },
  { label: 'Inainte de actualizare', value: 'entity.before_update' },
  { label: 'Inainte de stergere', value: 'entity.before_delete' }
]

function openCreate() {
  editingAction.value = null
  formName.value = ''
  formSlug.value = ''
  formEntityId.value = selectedEntityId.value || ''
  formWorkflowId.value = 'none'
  formDescription.value = ''
  formShowInUi.value = true
  formIsActive.value = true
  formTriggerEvents.value = []
  showModal.value = true
}

function openEdit(action: any) {
  editingAction.value = action
  formName.value = action.name
  formSlug.value = action.slug
  formEntityId.value = action.id_entity
  formWorkflowId.value = action.id_workflow ?? 'none'
  formDescription.value = action.description || ''
  formShowInUi.value = action.show_in_ui
  formIsActive.value = action.is_active
  formTriggerEvents.value = parseTriggerEvents(action.trigger_events)
  showModal.value = true
}

watch(formName, (val) => {
  if (!editingAction.value) {
    formSlug.value = val
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 100)
  }
})

async function onSubmit() {
  if (!formName.value.trim() || !formSlug.value.trim() || !formEntityId.value) {
    toast.add({ title: 'Completeaza campurile obligatorii', color: 'error' })
    return
  }

  if (editingAction.value) {
    const result = await updateAction(editingAction.value.id_action, {
      name: formName.value,
      show_in_ui: formShowInUi.value,
      is_active: formIsActive.value,
      id_workflow: formWorkflowId.value === 'none' ? undefined : (formWorkflowId.value || undefined),
      trigger_events: formTriggerEvents.value,
      description: formDescription.value || undefined
    })
    if (result) {
      toast.add({ title: 'Actiune actualizata', color: 'success' })
      showModal.value = false
    } else {
      toast.add({ title: 'Eroare', description: error.value ?? '', color: 'error' })
    }
  } else {
    const result = await createAction({
      name: formName.value,
      slug: formSlug.value,
      id_entity: formEntityId.value,
      show_in_ui: formShowInUi.value,
      is_active: formIsActive.value,
      id_workflow: formWorkflowId.value === 'none' ? undefined : (formWorkflowId.value || undefined),
      trigger_events: formTriggerEvents.value,
      description: formDescription.value || undefined
    })
    if (result) {
      toast.add({ title: 'Actiune creata', color: 'success' })
      showModal.value = false
    } else {
      toast.add({ title: 'Eroare', description: error.value ?? '', color: 'error' })
    }
  }
}

// ─── Bulk selection ───
const table = useTemplateRef('table')
const rowSelection = ref({})
const selectedCount = computed(() => Object.keys(rowSelection.value).length)

async function bulkDelete() {
  const selectedIndices = Object.keys(rowSelection.value).map(Number)
  const ids = selectedIndices.map(i => filteredActions.value[i]?.id_action).filter((id): id is string => !!id)
  const msg = await deleteActions(ids)
  rowSelection.value = {}
  if (msg) {
    toast.add({ title: msg, color: 'success' })
  } else {
    toast.add({ title: 'Eroare la stergere', description: error.value ?? '', color: 'error' })
  }
}

// ─── Delete ───
const showDeleteConfirm = ref(false)
const deletingAction = ref<any>(null)

function confirmDelete(action: any) {
  deletingAction.value = action
  showDeleteConfirm.value = true
}

async function onConfirmDelete() {
  if (!deletingAction.value) return
  const success = await deleteAction(deletingAction.value.id_action)
  if (success) {
    toast.add({ title: 'Actiune stearsa', color: 'success' })
  } else {
    toast.add({ title: 'Eroare la stergere', description: error.value ?? '', color: 'error' })
  }
  showDeleteConfirm.value = false
  deletingAction.value = null
}

// ─── Table ───
const columns: TableColumn<any>[] = [
  { id: 'drag', meta: { class: { th: 'w-8', td: 'w-8' } } },
  {
    id: 'select',
    meta: { class: { th: 'w-4', td: 'w-4' } },
    header: ({ table }) => h(UCheckbox, {
      'modelValue': table.getIsSomePageRowsSelected()
        ? 'indeterminate'
        : table.getIsAllPageRowsSelected(),
      'onUpdate:modelValue': (value: boolean | 'indeterminate') =>
        table.toggleAllPageRowsSelected(!!value),
      'ariaLabel': 'Selecteaza tot'
    }),
    cell: ({ row }) => h(UCheckbox, {
      'modelValue': row.getIsSelected(),
      'onUpdate:modelValue': (value: boolean | 'indeterminate') =>
        row.toggleSelected(!!value),
      'ariaLabel': 'Selecteaza rand'
    })
  },
  { id: 'edit', meta: { class: { th: 'w-10', td: 'w-10' } } },
  { accessorKey: 'name', header: 'Nume' },
  { accessorKey: 'slug', header: 'Slug' },
  { accessorKey: 'trigger_events', header: 'Triggers' },
  { accessorKey: 'workflow_name', header: 'Workflow' },
  { accessorKey: 'rank', header: 'Ordine' },
  { accessorKey: 'is_active', header: 'Activ' },
  { accessorKey: 'show_in_ui', header: 'Vizibil' },
  { id: 'actions', header: '' }
]

function getDropdownItems(action: any) {
  return [[{
    label: 'Editeaza',
    icon: 'i-lucide-pencil',
    onClick: () => openEdit(action)
  }], [{
    label: 'Sterge',
    icon: 'i-lucide-trash-2',
    color: 'error' as const,
    onClick: () => confirmDelete(action)
  }]]
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-lg font-semibold">
          Actiuni
        </h2>
        <p class="text-sm text-muted">
          Defineste actiuni (manuale sau automatice) pe entitati
        </p>
      </div>
      <div class="flex items-center gap-1.5">
        <UButton
          v-if="selectedCount > 0"
          label="Sterge"
          color="error"
          variant="subtle"
          icon="i-lucide-trash"
          @click="bulkDelete"
        >
          <template #trailing>
            <UKbd>{{ selectedCount }}</UKbd>
          </template>
        </UButton>
        <UButton
          label="Actiune noua"
          icon="i-lucide-plus"
          @click="openCreate"
        />
      </div>
    </div>

    <!-- Entity Filter -->
    <div class="mb-4">
      <USelect
        v-model="selectedEntityId"
        :items="entityOptions"
        value-key="value"
        label-key="label"
        placeholder="Toate entitatile"
        size="sm"
        class="w-64"
      />
    </div>

    <p v-if="!canReorder" class="mb-2 text-xs text-muted">
      Selecteaza o entitate pentru a reordona actiunile prin drag & drop.
    </p>
    <div
      ref="actionsTableRoot"
      data-rank-group="actions"
      :data-rank-disabled="!canReorder || savingRank || loading"
    >
      <UTable
        ref="table"
        v-model:row-selection="rowSelection"
        row-key="id_action"
        :data="filteredActions"
        :columns="columns"
        :loading="loading"
        class="w-full"
      >
        <template #drag-cell>
          <UButton
            :class="canReorder ? 'rank-drag-handle cursor-grab active:cursor-grabbing' : 'cursor-not-allowed opacity-35'"
            icon="i-lucide-grip-vertical"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="canReorder ? 'Muta actiunea' : 'Selecteaza o entitate pentru reordonare'"
          />
        </template>
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

        <template #trigger_events-cell="{ row }">
          <div class="flex gap-1 flex-wrap">
            <UBadge
              v-for="ev in parseTriggerEvents(row.original.trigger_events)"
              :key="ev"
              :label="ev"
              color="neutral"
              variant="subtle"
              size="xs"
            />
            <span v-if="!parseTriggerEvents(row.original.trigger_events).length" class="text-xs text-gray-400">Manual</span>
          </div>
        </template>

        <template #workflow_name-cell="{ row }">
          <span v-if="row.original.workflow_name" class="text-xs">{{ row.original.workflow_name }}</span>
          <span v-else class="text-xs text-gray-400">-</span>
        </template>

        <template #is_active-cell="{ row }">
          <UBadge
            :label="row.original.is_active ? 'Activ' : 'Inactiv'"
            :color="row.original.is_active ? 'success' : 'neutral'"
            variant="subtle"
            size="sm"
          />
        </template>

        <template #show_in_ui-cell="{ row }">
          <UIcon
            :name="row.original.show_in_ui ? 'i-lucide-eye' : 'i-lucide-eye-off'"
            class="size-4"
            :class="row.original.show_in_ui ? 'text-green-500' : 'text-gray-400'"
          />
        </template>

        <template #actions-cell="{ row }">
          <UDropdownMenu :items="getDropdownItems(row.original)">
            <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" />
          </UDropdownMenu>
        </template>
      </UTable>
    </div>

    <div v-if="!loading && filteredActions.length === 0" class="py-12">
      <UEmpty
        icon="i-lucide-zap"
        title="Nicio actiune"
        description="Creeaza prima actiune pentru a automatiza procese."
      >
        <template #actions>
          <UButton label="Actiune noua" icon="i-lucide-plus" @click="openCreate" />
        </template>
      </UEmpty>
    </div>

    <!-- Create/Edit Modal -->
    <UModal
      v-model:open="showModal"
      :title="editingAction ? 'Editeaza actiune' : 'Actiune noua'"
    >
      <template #body>
        <div class="space-y-4">
          <div>
            <label class="text-xs font-medium mb-1 block">Nume *</label>
            <UInput v-model="formName" placeholder="ex: Trimite email bun venit" size="sm" />
          </div>

          <div v-if="!editingAction">
            <label class="text-xs font-medium mb-1 block">Slug *</label>
            <UInput
              v-model="formSlug"
              placeholder="trimite_email_bun_venit"
              size="sm"
              class="font-mono"
            />
          </div>

          <div>
            <label class="text-xs font-medium mb-1 block">Entitate *</label>
            <USelect
              v-model="formEntityId"
              :items="entityOptions"
              value-key="value"
              label-key="label"
              placeholder="Selecteaza entitatea"
              size="sm"
              :disabled="!!editingAction"
            />
          </div>

          <div>
            <label class="text-xs font-medium mb-1 block">Workflow asociat</label>
            <USelect
              v-model="formWorkflowId"
              :items="workflowOptions"
              value-key="value"
              label-key="label"
              size="sm"
            />
          </div>

          <div>
            <label class="text-xs font-medium mb-1 block">Trigger automat pe evenimente</label>
            <div class="flex flex-wrap gap-2 mt-1">
              <label v-for="opt in triggerEventOptions" :key="opt.value" class="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  :value="opt.value"
                  :checked="formTriggerEvents.includes(opt.value)"
                  class="rounded border-gray-300"
                  @change="
                    formTriggerEvents.includes(opt.value)
                      ? formTriggerEvents = formTriggerEvents.filter(e => e !== opt.value)
                      : formTriggerEvents = [...formTriggerEvents, opt.value]
                  "
                >
                <span class="text-xs">{{ opt.label }}</span>
              </label>
            </div>
          </div>

          <div>
            <label class="text-xs font-medium mb-1 block">Descriere (optional)</label>
            <UTextarea
              v-model="formDescription"
              placeholder="Explica ce face actiunea..."
              size="sm"
              :rows="2"
            />
          </div>

          <div class="flex items-center gap-6">
            <label class="flex items-center gap-2">
              <input v-model="formShowInUi" type="checkbox" class="rounded border-gray-300">
              <span class="text-xs">Vizibil in UI</span>
            </label>
            <label class="flex items-center gap-2">
              <input v-model="formIsActive" type="checkbox" class="rounded border-gray-300">
              <span class="text-xs">Activ</span>
            </label>
          </div>

          <div class="flex items-center gap-3 justify-end pt-2">
            <UButton
              label="Anuleaza"
              color="neutral"
              variant="outline"
              @click="showModal = false"
            />
            <UButton
              :label="editingAction ? 'Salveaza' : 'Creeaza'"
              icon="i-lucide-check"
              :loading="loading"
              @click="onSubmit"
            />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Delete Confirm -->
    <UModal v-model:open="showDeleteConfirm" title="Confirmare stergere">
      <template #body>
        <p>
          Esti sigur ca vrei sa stergi actiunea
          <strong>{{ deletingAction?.name }}</strong>?
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
