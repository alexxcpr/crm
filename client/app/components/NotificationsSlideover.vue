<script setup lang="ts">
import { formatTimeAgo } from '@vueuse/core'
import type { AppNotification } from '~/types/notifications'

const router = useRouter()
const { isNotificationsSlideoverOpen } = useDashboard()
const { recent, unreadCount, loadingRecent, error, fetchRecent, setRead, markAllRead } = useNotifications()

watch(isNotificationsSlideoverOpen, (open) => {
  if (open) fetchRecent()
})

async function openNotification(notification: AppNotification) {
  if (!notification.is_read) await setRead(notification.id_notification, true)
  if (notification.target_entity_slug && notification.target_record_id) {
    await router.push(`/${notification.target_entity_slug}/${notification.target_record_id}`)
  }
}

async function toggleRead(notification: AppNotification) {
  await setRead(notification.id_notification, !notification.is_read)
}
</script>

<template>
  <USlideover v-model:open="isNotificationsSlideoverOpen" title="Notificari">
    <template #body>
      <div class="mb-3 flex items-center justify-between gap-2">
        <p class="text-sm text-muted">{{ unreadCount }} necitite</p>
        <UButton
          label="Marcheaza toate ca citite"
          icon="i-lucide-check-check"
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="unreadCount === 0"
          @click="markAllRead"
        />
      </div>

      <div v-if="loadingRecent" class="space-y-3">
        <USkeleton v-for="index in 4" :key="index" class="h-20 w-full" />
      </div>
      <UAlert v-else-if="error" color="error" variant="soft" :description="error" />
      <div v-else-if="!recent.length" class="py-12 text-center">
        <UIcon name="i-lucide-bell-off" class="mx-auto mb-3 size-10 text-muted" />
        <p class="text-sm text-muted">Nu ai notificari.</p>
      </div>
      <div v-else class="divide-y divide-default">
        <button
          v-for="notification in recent"
          :key="notification.id_notification"
          type="button"
          class="relative flex w-full gap-3 px-1 py-3 text-left hover:bg-elevated/50"
          @click="openNotification(notification)"
        >
          <span class="mt-1.5 size-2 shrink-0 rounded-full" :class="notification.is_read ? 'bg-transparent' : 'bg-primary'" />
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <p class="truncate text-sm font-semibold text-highlighted">{{ notification.subject }}</p>
              <time :datetime="notification.date_created" class="shrink-0 text-[11px] text-muted">
                {{ formatTimeAgo(new Date(notification.date_created)) }}
              </time>
            </div>
            <p class="mt-1 line-clamp-2 text-sm text-muted">{{ notification.content }}</p>
          </div>
          <UButton
            :icon="notification.is_read ? 'i-lucide-mail' : 'i-lucide-mail-open'"
            color="neutral"
            variant="ghost"
            size="xs"
            :title="notification.is_read ? 'Marcheaza ca necitita' : 'Marcheaza ca citita'"
            @click.stop="toggleRead(notification)"
          />
        </button>
      </div>
    </template>

    <template #footer>
      <UButton label="Vezi toate notificarile" icon="i-lucide-list" to="/notifications" block />
    </template>
  </USlideover>
</template>
