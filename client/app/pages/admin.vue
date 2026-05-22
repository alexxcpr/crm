<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const links = [[{
  label: 'Module',
  icon: 'i-lucide-boxes',
  to: '/admin/modules',
  exact: true
}, {
  label: 'Entitati',
  icon: 'i-lucide-database',
  to: '/admin/entities'
}, {
  label: 'Workflow-uri',
  icon: 'i-lucide-workflow',
  to: '/admin/workflows'
}, {
  label: 'Actiuni',
  icon: 'i-lucide-zap',
  to: '/admin/actions'
}]] satisfies NavigationMenuItem[][]
</script>

<template>
  <UDashboardPanel id="admin">
    <template #header>
      <UDashboardNavbar title="Administrare">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <UNavigationMenu :items="links" highlight class="-mx-1 flex-1" />
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="flex flex-col gap-4 sm:gap-6 w-full mx-auto">
        <NuxtPage />
      </div>
    </template>
  </UDashboardPanel>
</template>
