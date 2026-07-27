<script setup lang="ts">
defineProps<{
  collapsed?: boolean
}>()

const { branding } = useTenantBranding()
const fullLogo = computed(() => branding.value.logoUrl || '/moduvis_logo_v3_no_bg_cropped.png')
const compactLogo = computed(() => branding.value.logoUrl || '/moduvis_logo_v3_no_bg_cropped_icon.png')
</script>

<template>
  <NuxtLink
    to="/"
    :aria-label="branding.organizationName"
    class="flex items-center rounded-md transition hover:bg-elevated"
    :class="collapsed ? 'min-h-12 w-full justify-center px-1' : 'min-h-12 flex-1 justify-center lg:min-h-20 lg:w-full lg:flex-none'"
  >
    <div
      v-if="!collapsed"
      class="relative flex h-14 w-auto items-center justify-center overflow-visible bg-transparent px-3 before:absolute before:-inset-x-8 before:-inset-y-2 before:hidden before:bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,1)_0%,rgba(245,243,255,0.94)_42%,rgba(168,85,247,0.24)_72%,rgba(168,85,247,0)_100%)] before:blur-xl before:content-[''] dark:before:block lg:h-20 lg:w-full lg:px-0 lg:before:inset-x-0 lg:before:inset-y-3 lg:before:opacity-85 lg:before:blur-md"
    >
      <img
        :src="fullLogo"
        :alt="branding.organizationName"
        class="relative block h-12 max-w-[220px] object-contain lg:h-[4.5rem] lg:max-w-full lg:px-5 lg:py-2.5"
      >
    </div>
    <div
      v-else
      class="relative flex size-11 items-center justify-center overflow-hidden rounded-xl bg-transparent p-1 before:absolute before:inset-0 before:hidden before:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.96)_0%,rgba(245,243,255,0.88)_46%,rgba(168,85,247,0.2)_76%,rgba(168,85,247,0)_100%)] before:blur-sm before:content-[''] dark:before:block"
    >
      <img
        :src="compactLogo"
        :alt="branding.organizationName"
        class="relative block size-full object-contain"
      >
    </div>
  </NuxtLink>
</template>
