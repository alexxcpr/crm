<script setup lang="ts">
const { features } = useFeatures()
const enabled = computed(() => features.value.reportsDashboards === true)
const { isAdmin } = useNavigation()
</script>

<template>
  <DashboardViewer v-if="enabled" />
  <UDashboardPanel v-else id="home">
    <template #header>
      <UDashboardNavbar title="Acasa">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <UPageCard
        icon="i-lucide-house"
        title="Bun venit in Moduvis"
        description="Foloseste meniul din stanga pentru a accesa entitatile si fluxurile disponibile profilului tau."
      >
        <template v-if="isAdmin" #footer>
          <div class="flex items-center justify-between gap-4">
            <p class="text-sm text-muted">Dashboard-urile configurabile pot fi activate din abonament.</p>
            <UButton label="Vezi abonamentul" icon="i-lucide-credit-card" to="/admin/billing" />
          </div>
        </template>
      </UPageCard>
    </template>
  </UDashboardPanel>
</template>
