<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

definePageMeta({ middleware: ['capability'], requiredCapability: 'builder.manage' })

const { hasFeature } = useFeatures()

const links = computed(() => [[{
  label: 'Module',
  icon: 'i-lucide-boxes',
  to: '/builder/modules',
  exact: true
}, {
  label: 'Meniuri',
  icon: 'i-lucide-list-tree',
  to: '/builder/menus'
}, {
  label: 'Entitati',
  icon: 'i-lucide-database',
  to: '/builder/entities'
}, {
  label: 'Dashboard-uri',
  icon: 'i-lucide-layout-dashboard',
  to: '/builder/dashboards'
}, ...(hasFeature('calendars') ? [{
  label: 'Calendare',
  icon: 'i-lucide-calendar-days',
  to: '/builder/calendars'
}] : []), {
}, {
  label: 'Workflow-uri',
  icon: 'i-lucide-workflow',
  to: '/builder/workflows'
}, {
  label: 'Programari',
  icon: 'i-lucide-clock-3',
  to: '/builder/schedules'
}, {
  label: 'Actiuni',
  icon: 'i-lucide-zap',
  to: '/builder/actions'
}, {
  label: 'Domenii HTTP',
  icon: 'i-lucide-shield-check',
  to: '/builder/http-domains'
}]] satisfies NavigationMenuItem[][])
</script>

<template>
  <UDashboardPanel id="builder">
    <template #header>
      <UDashboardNavbar title="Builder">
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
