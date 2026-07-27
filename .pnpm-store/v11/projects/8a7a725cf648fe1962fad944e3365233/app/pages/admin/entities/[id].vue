<script setup lang="ts">
definePageMeta({ middleware: ['capability'], requiredCapability: 'builder.manage' })
const route = useRoute()
await navigateTo(`/builder/entities/${route.params.id}`, { replace: true })
</script>

<template><div /></template>
