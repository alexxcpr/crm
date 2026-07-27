<script setup lang="ts">
import { formatTimeAgo } from '@vueuse/core'
import type { AppNotification } from '~/types/notifications'

const router = useRouter()
const { fetchPage, setRead, markAllRead, unreadCount } = useNotifications()
const items = ref<AppNotification[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const selectedTab = ref<'all' | 'unread'>('all')
const search = ref('')
const page = ref(1)
const meta = reactive({ total: 0, page: 1, limit: 25, totalPages: 1 })
let searchTimer: ReturnType<typeof setTimeout> | undefined

const tabs = [
  { label: 'Toate', value: 'all' },
  { label: 'Necitite', value: 'unread' }
]

async function load() {
  loading.value = true
  error.value = null
  try {
    const response = await fetchPage({
      page: page.value,
      limit: 25,
      status: selectedTab.value,
      search: search.value.trim() || undefined
    })
    items.value = response.data
    Object.assign(meta, response.meta)
    unreadCount.value = response.unreadCount
  } catch (cause: any) {
    error.value = cause?.data?.message ?? 'Notificarile nu au putut fi incarcate.'
  } finally {
    loading.value = false
  }
}

watch(selectedTab, () => {
  page.value = 1
  load()
})

watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    load()
  }, 300)
})

watch(page, load)
onMounted(load)

async function openNotification(notification: AppNotification) {
  if (!notification.is_read) await toggleRead(notification, true)
  if (notification.target_entity_slug && notification.target_record_id) {
    await router.push(`/${notification.target_entity_slug}/${notification.target_record_id}`)
  }
}

async function toggleRead(notification: AppNotification, isRead = !notification.is_read) {
  const updated = await setRead(notification.id_notification, isRead)
  if (selectedTab.value === 'unread' && isRead) {
    await load()
    return
  }
  const index = items.value.findIndex(item => item.id_notification === notification.id_notification)
  if (index >= 0) items.value[index] = { ...items.value[index], ...updated }
}

async function readAll() {
  await markAllRead()
  await load()
}
</script>

<template>
  <UDashboardPanel id="notifications">
    <template #header>
      <UDashboardNavbar title="Notificari">
        <template #leading><UDashboardSidebarCollapse /></template>
        <template #trailing><UBadge :label="`${unreadCount} necitite`" variant="subtle" /></template>
        <template #right>
          <UButton
            label="Marcheaza toate ca citite"
            icon="i-lucide-check-check"
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="unreadCount === 0"
            @click="readAll"
          />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <UTabs v-model="selectedTab" :items="tabs" :content="false" size="sm" />
        <UInput v-model="search" icon="i-lucide-search" placeholder="Cauta in notificari..." class="ml-auto w-full sm:w-72" />
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-4xl flex-col gap-3">
        <UAlert v-if="error" color="error" variant="soft" :description="error" />
        <template v-if="loading">
          <USkeleton v-for="index in 6" :key="index" class="h-24 w-full" />
        </template>
        <UPageCard v-else-if="!items.length" icon="i-lucide-bell-off" title="Nicio notificare" description="Nu exista notificari pentru filtrul selectat." />
        <button
          v-for="notification in items"
          v-else
          :key="notification.id_notification"
          type="button"
          class="flex w-full items-start gap-3 rounded-lg border border-default bg-default p-4 text-left transition hover:bg-elevated/50"
          @click="openNotification(notification)"
        >
          <span class="mt-2 size-2.5 shrink-0 rounded-full" :class="notification.is_read ? 'bg-transparent' : 'bg-primary'" />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="font-semibold text-highlighted">{{ notification.subject }}</h3>
              <time :datetime="notification.date_created" class="text-xs text-muted">{{ formatTimeAgo(new Date(notification.date_created)) }}</time>
            </div>
            <p class="mt-1 whitespace-pre-wrap text-sm text-muted">{{ notification.content }}</p>
          </div>
          <UButton
            :icon="notification.is_read ? 'i-lucide-mail' : 'i-lucide-mail-open'"
            color="neutral"
            variant="ghost"
            size="sm"
            :title="notification.is_read ? 'Marcheaza ca necitita' : 'Marcheaza ca citita'"
            @click.stop="toggleRead(notification)"
          />
        </button>

        <div v-if="meta.totalPages > 1" class="flex justify-end pt-2">
          <UPagination
            :page="page"
            :items-per-page="meta.limit"
            :total="meta.total"
            @update:page="(value: number) => { page = value }"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
