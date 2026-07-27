<script setup lang="ts">
definePageMeta({ middleware: ['capability'], requiredCapability: 'builder.manage' })
await navigateTo('/builder/menus', { replace: true })
</script>

<template><div /></template>
