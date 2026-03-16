<script setup lang="ts">
const { entity: entityMeta } = useEntitySchema('contacts')
</script>

<template>
  <UDashboardPanel id="contacts">
    <template #header>
      <UDashboardNavbar :title="entityMeta?.label_plural ?? 'Contacte'">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <DynamicTable
        entity="contacts"
        @add="navigateTo('/contacts/create')"
        @edit="(id) => navigateTo(`/contacts/${id}`)"
      />
    </template>
  </UDashboardPanel>
</template>