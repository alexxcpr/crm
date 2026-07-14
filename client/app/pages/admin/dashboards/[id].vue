<script setup lang="ts">
const route = useRoute()
const id = computed(() => String(route.params.id))
</script>

<template>
  <AdminDashboardBuilder :dashboard-id="id === 'new' ? undefined : id" />
</template>
