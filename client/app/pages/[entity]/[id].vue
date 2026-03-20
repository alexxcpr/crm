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
  <UDashboardPanel :id="`${entitySlug}-edit`">
    <template #header>
      <UDashboardNavbar :title="`Editare ${entityMeta?.label_singular ?? entitySlug}`">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #trailing>
          <UButton
            label="Inapoi la lista"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            @click="navigateTo(`/${entitySlug}`)"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-6xl p-6">
        <DynamicForm
          :entity="entitySlug"
          :record-id="recordId"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
