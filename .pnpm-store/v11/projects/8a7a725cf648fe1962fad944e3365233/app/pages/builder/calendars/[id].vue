<script setup lang="ts">
definePageMeta({ middleware: ['capability'], requiredCapability: 'builder.manage' })

const route = useRoute()
const id = computed(() => String(route.params.id))
</script>

<template>
  <AdminCalendarBuilder :calendar-id="id === 'new' ? undefined : id" />
</template>
