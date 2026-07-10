<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { AdminMenu, AdminMenuItem } from '~/types/admin'

const {
  menus,
  loading,
  error,
  fetchMenus,
  deleteMenu,
  deleteMenuItem
} = useAdminMenus()
const { entities, fetchEntities } = useAdminEntities()
const toast = useToast()

await Promise.all([fetchMenus(), fetchEntities()])

const selectedMenuId = ref(menus.value[0]?.id_menu ?? '')
const selectedMenu = computed(() => menus.value.find(menu => menu.id_menu === selectedMenuId.value) ?? null)
const selectedItems = computed(() => [...(selectedMenu.value?.items ?? [])].sort((a, b) => a.rank - b.rank))

watch(menus, (value) => {
  if (!value.length) {
    selectedMenuId.value = ''
    return
  }

  if (!value.some(menu => menu.id_menu === selectedMenuId.value)) {
    selectedMenuId.value = value[0]!.id_menu
  }
})

const showMenuModal = ref(false)
const editingMenu = ref<AdminMenu | null>(null)

function openCreateMenu() {
  editingMenu.value = null
  showMenuModal.value = true
}

function openEditMenu(menu: AdminMenu) {
  editingMenu.value = menu
  showMenuModal.value = true
}

async function onMenuSaved(menu: AdminMenu) {
  await fetchMenus()
  selectedMenuId.value = menu.id_menu
  showMenuModal.value = false
  editingMenu.value = null
}

const showItemModal = ref(false)
const editingItem = ref<AdminMenuItem | null>(null)

function openCreateItem() {
  if (!selectedMenu.value) return
  editingItem.value = null
  showItemModal.value = true
}

function openEditItem(item: AdminMenuItem) {
  editingItem.value = item
  showItemModal.value = true
}

async function onItemSaved() {
  await fetchMenus()
  showItemModal.value = false
  editingItem.value = null
}

const deletingMenu = ref<AdminMenu | null>(null)
const deletingItem = ref<AdminMenuItem | null>(null)
const showDeleteMenuConfirm = ref(false)
const showDeleteItemConfirm = ref(false)

function confirmDeleteMenu(menu: AdminMenu) {
  deletingMenu.value = menu
  showDeleteMenuConfirm.value = true
}

function confirmDeleteItem(item: AdminMenuItem) {
  deletingItem.value = item
  showDeleteItemConfirm.value = true
}

async function onConfirmDeleteMenu() {
  if (!deletingMenu.value) return

  const success = await deleteMenu(deletingMenu.value.id_menu)
  toast.add({
    title: success ? 'Meniu sters' : 'Eroare la stergere',
    description: success ? undefined : error.value ?? '',
    color: success ? 'success' : 'error'
  })

  showDeleteMenuConfirm.value = false
  deletingMenu.value = null
}

async function onConfirmDeleteItem() {
  if (!deletingItem.value) return

  const success = await deleteMenuItem(deletingItem.value.id_menu_item)
  toast.add({
    title: success ? 'Element sters' : 'Eroare la stergere',
    description: success ? undefined : error.value ?? '',
    color: success ? 'success' : 'error'
  })

  showDeleteItemConfirm.value = false
  deletingItem.value = null
}

const menuColumns: TableColumn<AdminMenu>[] = [
  { id: 'select', meta: { class: { th: 'w-10', td: 'w-10' } } },
  { id: 'edit', meta: { class: { th: 'w-10', td: 'w-10' } } },
  { accessorKey: 'name', header: 'Denumire' },
  { accessorKey: 'icon', header: 'Icon' },
  { accessorKey: 'rank', header: 'Ordine' },
  { accessorKey: 'is_active', header: 'Activ' },
  { id: 'items', header: 'Elemente' },
  { id: 'actions', header: '' }
]

const itemColumns: TableColumn<AdminMenuItem>[] = [
  { id: 'edit', meta: { class: { th: 'w-10', td: 'w-10' } } },
  { accessorKey: 'name', header: 'Denumire' },
  { accessorKey: 'open_link', header: 'Link' },
  { accessorKey: 'link_type', header: 'Tip' },
  { accessorKey: 'icon', header: 'Icon' },
  { accessorKey: 'rank', header: 'Ordine' },
  { accessorKey: 'is_active', header: 'Activ' },
  { id: 'actions', header: '' }
]

function menuDropdownItems(menu: AdminMenu) {
  return [[{
    label: 'Editeaza',
    icon: 'i-lucide-pencil',
    onClick: () => openEditMenu(menu)
  }], [{
    label: 'Sterge',
    icon: 'i-lucide-trash-2',
    color: 'error' as const,
    onClick: () => confirmDeleteMenu(menu)
  }]]
}

function itemDropdownItems(item: AdminMenuItem) {
  return [[{
    label: 'Editeaza',
    icon: 'i-lucide-pencil',
    onClick: () => openEditItem(item)
  }], [{
    label: 'Sterge',
    icon: 'i-lucide-trash-2',
    color: 'error' as const,
    onClick: () => confirmDeleteItem(item)
  }]]
}

const linkTypeLabels: Record<string, string> = {
  entity_list: 'Lista',
  entity_create: 'Create',
  entity_record: 'Record',
  internal_route: 'Intern',
  external_url: 'Extern'
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-lg font-semibold">
          Meniuri
        </h2>
        <p class="text-sm text-muted">
          Configureaza categoriile si linkurile afisate in sidebar.
        </p>
      </div>
      <UButton
        label="Adauga meniu"
        icon="i-lucide-plus"
        @click="openCreateMenu"
      />
    </div>

    <UTable
      :data="menus"
      :columns="menuColumns"
      :loading="loading"
      row-key="id_menu"
      class="w-full"
    >
      <template #select-cell="{ row }">
        <UButton
          :icon="selectedMenuId === row.original.id_menu ? 'i-lucide-check' : 'i-lucide-list-tree'"
          color="neutral"
          variant="ghost"
          size="xs"
          @click="selectedMenuId = row.original.id_menu"
        />
      </template>

      <template #edit-cell="{ row }">
        <UButton
          icon="i-lucide-pencil"
          label="Edit"
          color="neutral"
          variant="ghost"
          size="xs"
          @click="openEditMenu(row.original)"
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

      <template #items-cell="{ row }">
        <UBadge
          :label="String(row.original.items?.length ?? row.original._count?.items ?? 0)"
          color="neutral"
          variant="subtle"
        />
      </template>

      <template #actions-cell="{ row }">
        <UDropdownMenu :items="menuDropdownItems(row.original)">
          <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" />
        </UDropdownMenu>
      </template>
    </UTable>

    <div v-if="!loading && menus.length === 0" class="py-12">
      <UEmpty
        icon="i-lucide-list-tree"
        title="Niciun meniu"
        description="Creeaza primul meniu pentru sidebar."
      >
        <template #actions>
          <UButton label="Adauga meniu" icon="i-lucide-plus" @click="openCreateMenu" />
        </template>
      </UEmpty>
    </div>

    <div v-if="selectedMenu" class="mt-8">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-base font-semibold">
            Elemente: {{ selectedMenu.name }}
          </h3>
          <p class="text-sm text-muted">
            Linkurile sunt afisate in sidebar in ordinea de mai jos.
          </p>
        </div>
        <UButton
          label="Adauga element"
          icon="i-lucide-plus"
          @click="openCreateItem"
        />
      </div>

      <UTable
        :data="selectedItems"
        :columns="itemColumns"
        :loading="loading"
        row-key="id_menu_item"
        class="w-full"
      >
        <template #edit-cell="{ row }">
          <UButton
            icon="i-lucide-pencil"
            label="Edit"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="openEditItem(row.original)"
          />
        </template>

        <template #open_link-cell="{ row }">
          <span class="font-mono text-xs">{{ row.original.open_link }}</span>
        </template>

        <template #link_type-cell="{ row }">
          <UBadge
            :label="linkTypeLabels[row.original.link_type] ?? row.original.link_type"
            color="neutral"
            variant="subtle"
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
          <UDropdownMenu :items="itemDropdownItems(row.original)">
            <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" />
          </UDropdownMenu>
        </template>
      </UTable>

      <div v-if="selectedItems.length === 0" class="py-10">
        <UEmpty
          icon="i-lucide-link"
          title="Niciun element"
          description="Adauga primul link pentru acest meniu."
        >
          <template #actions>
            <UButton label="Adauga element" icon="i-lucide-plus" @click="openCreateItem" />
          </template>
        </UEmpty>
      </div>
    </div>

    <UModal
      v-model:open="showMenuModal"
      :title="editingMenu ? 'Editeaza meniu' : 'Meniu nou'"
    >
      <template #body>
        <AdminMenuForm
          :key="editingMenu?.id_menu ?? 'new-menu'"
          :menu="editingMenu"
          @saved="onMenuSaved"
          @cancel="showMenuModal = false"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="showItemModal"
      :title="editingItem ? 'Editeaza element' : 'Element nou'"
    >
      <template #body>
        <AdminMenuItemForm
          v-if="selectedMenu"
          :key="editingItem?.id_menu_item ?? `new-item-${selectedMenu.id_menu}`"
          :menu-id="selectedMenu.id_menu"
          :item="editingItem"
          :entities="entities"
          @saved="onItemSaved"
          @cancel="showItemModal = false"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="showDeleteMenuConfirm"
      title="Confirmare stergere"
      description="Stergerea meniului va sterge si elementele lui."
    >
      <template #body>
        <p>
          Esti sigur ca vrei sa stergi meniul
          <strong>{{ deletingMenu?.name }}</strong>?
        </p>
        <div class="flex items-center gap-3 justify-end mt-4">
          <UButton label="Anuleaza" color="neutral" variant="outline" @click="showDeleteMenuConfirm = false" />
          <UButton label="Sterge" color="error" icon="i-lucide-trash-2" :loading="loading" @click="onConfirmDeleteMenu" />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="showDeleteItemConfirm"
      title="Confirmare stergere"
    >
      <template #body>
        <p>
          Esti sigur ca vrei sa stergi elementul
          <strong>{{ deletingItem?.name }}</strong>?
        </p>
        <div class="flex items-center gap-3 justify-end mt-4">
          <UButton label="Anuleaza" color="neutral" variant="outline" @click="showDeleteItemConfirm = false" />
          <UButton label="Sterge" color="error" icon="i-lucide-trash-2" :loading="loading" @click="onConfirmDeleteItem" />
        </div>
      </template>
    </UModal>
  </div>
</template>
