<script setup lang="ts">
definePageMeta({ middleware: ['capability'], requiredCapability: 'builder.manage' })
await navigateTo('/builder/dashboards', { replace: true })
</script>

<template><div /></template>
