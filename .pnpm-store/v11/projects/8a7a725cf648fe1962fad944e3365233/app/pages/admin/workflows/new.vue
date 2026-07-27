<script setup lang="ts">
definePageMeta({ middleware: ['capability'], requiredCapability: 'builder.manage' })
await navigateTo('/builder/workflows/new', { replace: true })
</script>

<template><div /></template>
