<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { upperFirst } from 'scule'
import { getPaginationRowModel } from '@tanstack/table-core'
import type { Row } from '@tanstack/table-core'
import type { ContactDto } from '~/types'
import { stringCoalesceNull } from '../utils/string.utils'
import { boolReturnBadge } from '../utils/bool.utils'


const UButton = resolveComponent('UButton')
const UDropdownMenu = resolveComponent('UDropdownMenu')
const UCheckbox = resolveComponent('UCheckbox')

const toast = useToast()
const table = useTemplateRef('table')

const config = useRuntimeConfig()
const { token } = useAuth()

const { entity, tableFields, loading: schemaLoading } = useEntitySchema('contacts')
const { items, meta, loading: dataLoading, fetchItems } = useEntityData('contacts')

await fetchItems({ page: 1, limit: 25 })

// const columnFilters = ref([{
//   id: 'email_companie',
//   value: ''
// }])

const columnFilters = ref([])
const columnVisibility = ref()
const rowSelection = ref({})

const { data, status, refresh } = await useFetch<ContactDto[]>(`/contacts`, {
  baseURL: config.public.apiBase,
  lazy: true,
  headers: {
    Authorization: token.value as string
  }
})

function getRowItems(row: Row<ContactDto>) {
  return [
    {
      type: 'label',
      label: 'Actions'
    },
    {
      label: 'Copy customer ID',
      icon: 'i-lucide-copy',
      onSelect() {
        navigator.clipboard.writeText(row.original.id.toString())
        toast.add({
          title: 'Copied to clipboard',
          description: 'Customer ID copied to clipboard'
        })
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'View customer details',
      icon: 'i-lucide-list'
    },
    {
      label: 'View customer payments',
      icon: 'i-lucide-wallet'
    },
    {
      type: 'separator'
    },
    {
      label: 'Delete customer',
      icon: 'i-lucide-trash',
      color: 'error',
      onSelect() {
        toast.add({
          title: 'Customer deleted',
          description: 'The customer has been deleted.'
        })
      }
    }
  ]
}

const columns: TableColumn<ContactDto>[] = [
  {
    id: 'select',
    header: ({ table }) =>
      h(UCheckbox, {
        'modelValue': table.getIsSomePageRowsSelected()
          ? 'indeterminate'
          : table.getIsAllPageRowsSelected(),
        'onUpdate:modelValue': (value: boolean | 'indeterminate') =>
          table.toggleAllPageRowsSelected(!!value),
        'ariaLabel': 'Select all'
      }),
    cell: ({ row }) =>
      h(UCheckbox, {
        'modelValue': row.getIsSelected(),
        'onUpdate:modelValue': (value: boolean | 'indeterminate') => row.toggleSelected(!!value),
        'ariaLabel': 'Select row'
      })
  },
  {
    accessorKey: 'id',
    header: 'ID'
  },
  {
    accessorKey: 'nume',
    header: 'Name',
    cell: ({ row }) => stringCoalesceNull(row.original.nume)
    // cell: ({ row }) => {
    //   return h('div', { class: 'flex items-center gap-3' }, [
    //     h('div', undefined, [
    //       h('p', { class: 'font-medium text-highlighted' }, row.original.nume ?? ''),
    //       h('p', { class: '' }, row.original.nume ? `@${row.original.nume}` : '')
    //     ])
    //   ])
    // }
  },
  {
    accessorKey: 'prenume',
    header: 'Prenume',
    cell: ({ row }) => stringCoalesceNull(row.original.prenume)
  },
  {
    accessorKey: 'telefon1',
    header: 'Telefon 1',
    cell: ({ row }) => stringCoalesceNull(row.original.telefon1)
  },
  {
    accessorKey: 'telefon2',
    header: 'Telefon 2', 
    cell: ({ row }) => stringCoalesceNull(row.original.telefon2)
  },
  {
    accessorKey: 'email_companie',
    header: 'Email Companie',
    cell: ({ row }) => stringCoalesceNull(row.original.email_companie)

    // header: ({ column }) => {
    //   const isSorted = column.getIsSorted()

    //   return h(UButton, {
    //     color: 'neutral',
    //     variant: 'ghost',
    //     label: 'Email companie',
    //     icon: isSorted
    //       ? isSorted === 'asc'
    //         ? 'i-lucide-arrow-up-narrow-wide'
    //         : 'i-lucide-arrow-down-wide-narrow'
    //       : 'i-lucide-arrow-up-down',
    //     class: '-mx-2.5',
    //     onClick: () => column.toggleSorting(column.getIsSorted() === 'asc')
    //   })
    // }
  },
  {
    accessorKey: 'email_alternativ',
    header: 'Email Alternativ',
    cell: ({ row }) => stringCoalesceNull(row.original.email_alternativ)
  },
  {
    accessorKey: 'pozitie',
    header: 'Poziție în companie',
    cell: ({ row }) => stringCoalesceNull(row.original.pozitie)
  },
  {
    accessorKey: 'is_decision_maker',
    header: 'BDM (Business Decision Maker)',
    cell: ({ row }) => boolReturnBadge (row.original.is_decision_maker)
  },
  // {
  //   accessorKey: 'location',
  //   header: 'Location',
  //   cell: ({ row }) => row.original.location
  // },
  // {
  //   accessorKey: 'status',
  //   header: 'Status',
  //   filterFn: 'equals',
  //   cell: ({ row }) => {
  //     const color = {
  //       subscribed: 'success' as const,
  //       unsubscribed: 'error' as const,
  //       bounced: 'warning' as const
  //     }[row.original.status]

  //     return h(UBadge, { class: 'capitalize', variant: 'subtle', color }, () =>
  //       row.original.status
  //     )
  //   }
  // },
  {
    accessorKey: 'profile_linkedin',
    header: 'Profil LinkedIn',
    cell: ({ row }) => stringCoalesceNull(row.original.profile_linkedin)
  },
  {
    accessorKey: 'is_activ',
    header: 'Activ?',
    cell: ({ row }) => boolReturnBadge (row.original.is_activ)
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      return h(
        'div',
        { class: 'text-right' },
        h(
          UDropdownMenu,
          {
            content: {
              align: 'end'
            },
            items: getRowItems(row)
          },
          () =>
            h(UButton, {
              icon: 'i-lucide-ellipsis-vertical',
              color: 'neutral',
              variant: 'ghost',
              class: 'ml-auto'
            })
        )
      )
    }
  }
]

const statusFilter = ref('all')

watch(() => statusFilter.value, (newVal) => {
  if (!table?.value?.tableApi) return

  const statusColumn = table.value.tableApi.getColumn('status')
  if (!statusColumn) return

  if (newVal === 'all') {
    statusColumn.setFilterValue(undefined)
  } else {
    statusColumn.setFilterValue(newVal)
  }
})

const email = computed({
  get: (): string => {
    return (table.value?.tableApi?.getColumn('email_companie')?.getFilterValue() as string) || ''
  },
  set: (value: string) => {
    table.value?.tableApi?.getColumn('email_companie')?.setFilterValue(value || undefined)
  }
})

const pagination = ref({
  pageIndex: 0,
  pageSize: 10
})
</script>

<template>
  <UDashboardPanel id="contacts">
    <template #header>
      <UDashboardNavbar title="Contacts">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <CustomersAddModal />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-wrap items-center justify-between gap-1.5">
        <UInput
          v-model="email"
          class="max-w-sm"
          icon="i-lucide-search"
          placeholder="Filter emails..."
        />

        <div class="flex flex-wrap items-center gap-1.5">
          <CustomersDeleteModal :count="table?.tableApi?.getFilteredSelectedRowModel().rows.length">
            <UButton
              v-if="table?.tableApi?.getFilteredSelectedRowModel().rows.length"
              label="Delete"
              color="error"
              variant="subtle"
              icon="i-lucide-trash"
            >
              <template #trailing>
                <UKbd>
                  {{ table?.tableApi?.getFilteredSelectedRowModel().rows.length }}
                </UKbd>
              </template>
            </UButton>
          </CustomersDeleteModal>

          <USelect
            v-model="statusFilter"
            :items="[
              { label: 'All', value: 'all' },
              { label: 'Subscribed', value: 'subscribed' },
              { label: 'Unsubscribed', value: 'unsubscribed' },
              { label: 'Bounced', value: 'bounced' }
            ]"
            :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200' }"
            placeholder="Filter status"
            class="min-w-28"
          />
          <UDropdownMenu
            :items="
              table?.tableApi
                ?.getAllColumns()
                .filter((column: any) => column.getCanHide())
                .map((column: any) => ({
                  label: upperFirst(column.id),
                  type: 'checkbox' as const,
                  checked: column.getIsVisible(),
                  onUpdateChecked(checked: boolean) {
                    table?.tableApi?.getColumn(column.id)?.toggleVisibility(!!checked)
                  },
                  onSelect(e?: Event) {
                    e?.preventDefault()
                  }
                }))
            "
            :content="{ align: 'end' }"
          >
            <UButton
              label="Display"
              color="neutral"
              variant="outline"
              trailing-icon="i-lucide-settings-2"
            />
          </UDropdownMenu>
        </div>
      </div>

      <UTable
        ref="table"
        v-model:column-filters="columnFilters"
        v-model:column-visibility="columnVisibility"
        v-model:row-selection="rowSelection"
        v-model:pagination="pagination"
        :pagination-options="{
          getPaginationRowModel: getPaginationRowModel()
        }"
        class="shrink-0"
        :data="data"
        :columns="columns"
        :loading="status === 'pending'"
        :ui="{
          base: 'table-fixed border-separate border-spacing-0',
          thead: '[&>tr]:bg-elevated/50 [&>tr]:after:content-none',
          tbody: '[&>tr]:last:[&>td]:border-b-0',
          th: 'py-2 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r',
          td: 'border-b border-default',
          separator: 'h-0'
        }"
      />

      <div class="flex items-center justify-between gap-3 border-t border-default pt-4 mt-auto">
        <div class="text-sm text-muted">
          {{ table?.tableApi?.getFilteredSelectedRowModel().rows.length || 0 }} of
          {{ table?.tableApi?.getFilteredRowModel().rows.length || 0 }} row(s) selected
        </div>

        <div>
          <pre>Entity: {{ entity }}</pre>
          <pre>Fields: {{ tableFields.length }} coloane</pre>
          <pre>Items: {{ items.length }} / {{ meta.total }} total</pre>
        </div>

        <div class="flex items-center gap-1.5">
          <UPagination
            :default-page="(table?.tableApi?.getState().pagination.pageIndex || 0) + 1"
            :items-per-page="table?.tableApi?.getState().pagination.pageSize"
            :total="table?.tableApi?.getFilteredRowModel().rows.length"
            @update:page="(p: number) => table?.tableApi?.setPageIndex(p - 1)"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
