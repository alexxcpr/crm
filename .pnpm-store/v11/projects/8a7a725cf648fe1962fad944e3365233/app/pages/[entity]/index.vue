<script setup lang="ts">
definePageMeta({
  middleware: ['validate-entity']
})

const route = useRoute()
const entitySlug = computed(() => route.params.entity as string)

const { entity: entityMeta, capabilities } = useEntitySchema(entitySlug)
</script>

<template>
  <UDashboardPanel :id="entitySlug" :ui="{ body: 'p-3 sm:p-3' }">
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
            <UIcon name="i-lucide-table-2" class="size-4" />
          </div>

          <div class="min-w-0 flex-1">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-primary">
              Lista
            </p>
            <h1 class="truncate text-sm sm:text-base font-semibold text-highlighted">
              {{ entityMeta?.label_plural ?? entitySlug }}
            </h1>
          </div>
        </template>

        <template #right>
          <UButton
            v-if="capabilities.create"
            icon="i-lucide-plus"
            color="primary"
            variant="solid"
            size="sm"
            class="h-full min-h-13 shrink-0 rounded-xl px-3 text-sm font-semibold shadow-sm sm:px-4"
            @click="navigateTo(`/${entitySlug}/create`)"
          >
            <span class="hidden sm:inline">Adauga {{ entityMeta?.label_singular ?? '' }}</span>
            <span class="sm:hidden">Adauga</span>
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <DynamicTable
        :entity="entitySlug"
        @add="navigateTo(`/${entitySlug}/create`)"
        @edit="(id) => navigateTo(`/${entitySlug}/${id}`)"
      />
    </template>
  </UDashboardPanel>
</template>
