<!-- client/pages/dashboard.vue -->
<template>
  <div class="p-8">
    <UCard>
      <h1 class="text-3xl mb-4">
        Dashboard Moduvis
      </h1>

      <!-- data contine utilizatorul returnat de NestJS din /api/user/me -->
      <div v-if="user" class="mb-6">
        <p>Bun venit, <strong>{{ user.profile?.display_name || user.profile?.username || user.profile?.email }}</strong>!</p>
        <p class="text-sm text-gray-500">
          ID Utilizator: {{ user.id }}
        </p>
      </div>

      <UButton color="primary" variant="outline" @click="handleLogout">
        Deconectare
      </UButton>
    </UCard>
  </div>
</template>

<script setup lang="ts">
// data contine tot ce returneaza getProfile din NestJS
const { data, signOut } = useAuth()

const user = computed(() => data.value as { id: string, profile?: { display_name?: string, username?: string, email?: string } } | null)

async function handleLogout() {
  // Apeleaza automat NestJS pentru logout si sterge cookie-ul local
  await signOut({ callbackUrl: '/login' })
}
</script>
