<script setup lang="ts">
definePageMeta({
  middleware: ['validate-entity']
})

const route = useRoute()
const entitySlug = computed(() => route.params.entity as string)

const { entity: entityMeta } = useEntitySchema(entitySlug)
</script>

<template>
  <UDashboardPanel :id="entitySlug">
    <template #header>
      <UDashboardNavbar :title="entityMeta?.label_plural ?? entitySlug">
        <template #leading>
          <UDashboardSidebarCollapse />
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
