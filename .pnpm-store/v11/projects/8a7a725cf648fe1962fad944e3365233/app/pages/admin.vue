<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

definePageMeta({ middleware: ['capability'], requiredCapability: 'tenant.manage' })

const links = [[{
  label: 'Organizatie',
  icon: 'i-lucide-building-2',
  to: '/admin/organization',
  exact: true
}, {
  label: 'Securitate',
  icon: 'i-lucide-shield-check',
  to: '/admin/security'
}, {
  label: 'Abonament',
  icon: 'i-lucide-credit-card',
  to: '/admin/billing'
}, {
  label: 'Integrari',
  icon: 'i-lucide-plug',
  to: '/admin/integrations'
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
