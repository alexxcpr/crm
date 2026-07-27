<script setup lang="ts">
definePageMeta({ middleware: ['capability'], requiredCapability: 'builder.manage' })
await navigateTo('/builder/modules', { replace: true })
</script>

<template><div /></template>
