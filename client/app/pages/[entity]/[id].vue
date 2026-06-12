<script setup lang="ts">
definePageMeta({
  middleware: ['validate-entity']
})

const route = useRoute()
const entitySlug = computed(() => route.params.entity as string)
const recordId = computed(() => route.params.id as string)

const { entity: entityMeta } = useEntitySchema(entitySlug)
</script>

<template>
  <UDashboardPanel :id="`${entitySlug}-edit`" :ui="{ body: 'p-3 sm:p-3' }">
    <template #header>
      <UDashboardNavbar
        :ui="{
          root: 'h-auto border-b border-default bg-linear-to-r from-primary/10 via-primary/5 to-transparent px-3 py-2 gap-2',
          left: 'min-w-0 flex-1 rounded-xl border border-primary/15 bg-white/85 dark:bg-gray-900/85 px-2.5 py-2 shadow-sm backdrop-blur',
          right: 'shrink-0 self-stretch'
        }"
      >
        <template #left>
          <UDashboardSidebarCollapse class="shrink-0" />

          <div class="hidden sm:flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <UIcon name="i-lucide-pencil-line" class="size-4" />
          </div>

          <div class="min-w-0 flex-1">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-primary">
              Editare
            </p>
            <h1 class="truncate text-sm sm:text-base font-semibold text-highlighted">
              {{ entityMeta?.label_singular ?? entitySlug }}
            </h1>
          </div>
        </template>

        <template #right>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="outline"
            size="sm"
            class="h-full min-h-13 shrink-0 rounded-xl border-primary/25 bg-primary/5 px-3 text-sm font-semibold text-primary hover:border-primary/40 hover:bg-primary/10 sm:px-4"
            @click="navigateTo(`/${entitySlug}`)"
          >
            <span class="hidden sm:inline">Inapoi la lista</span>
            <span class="sm:hidden">Lista</span>
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <DynamicForm
        :entity="entitySlug"
        :record-id="recordId"
      />
    </template>
  </UDashboardPanel>
</template>
