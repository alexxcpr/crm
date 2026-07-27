<script setup lang="ts">
definePageMeta({ middleware: ['capability'], requiredCapability: 'builder.manage' })
const route = useRoute()
await navigateTo(`/builder/dashboards/${route.params.id}`, { replace: true })
</script>

<template><div /></template>
