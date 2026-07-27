<script setup lang="ts">
defineProps<{ collapsed?: boolean }>()

const { isNotificationsSlideoverOpen } = useDashboard()
const { unreadCount, fetchUnreadCount } = useNotifications()

onMounted(fetchUnreadCount)
</script>

<template>
  <UButton
    :label="collapsed ? undefined : 'Notificari'"
    icon="i-lucide-bell"
    color="neutral"
    variant="ghost"
    block
    :square="collapsed"
    class="relative justify-start"
    @click="isNotificationsSlideoverOpen = true"
  >
    <template v-if="!collapsed && unreadCount > 0" #trailing>
      <UBadge :label="unreadCount > 99 ? '99+' : String(unreadCount)" color="error" variant="solid" size="xs" />
    </template>
    <span
      v-if="collapsed && unreadCount > 0"
      class="absolute right-1 top-1 min-w-4 rounded-full bg-error px-1 text-center text-[10px] font-semibold text-white"
    >{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
  </UButton>
</template>
