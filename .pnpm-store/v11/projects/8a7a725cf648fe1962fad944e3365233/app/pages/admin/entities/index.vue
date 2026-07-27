<script setup lang="ts">
definePageMeta({ middleware: ['capability'], requiredCapability: 'builder.manage' })
await navigateTo('/builder/entities', { replace: true })
</script>

<template><div /></template>
