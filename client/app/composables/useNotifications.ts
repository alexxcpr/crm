import { createSharedComposable } from '@vueuse/core'
import type { AppNotification, NotificationsResponse } from '~/types/notifications'

const _useNotifications = () => {
  const { apiFetch } = useApi()
  const { session } = useProfiles()
  const recent = useState<AppNotification[]>('notifications:recent', () => [])
  const unreadCount = useState<number>('notifications:unread-count', () => 0)
  const loadingRecent = useState<boolean>('notifications:loading-recent', () => false)
  const error = useState<string | null>('notifications:error', () => null)

  async function fetchUnreadCount() {
    try {
      const response = await apiFetch<{ data: { count: number } }>('/v1/notifications/unread-count')
      unreadCount.value = response.data.count
    } catch {
      unreadCount.value = 0
    }
  }

  async function fetchRecent() {
    loadingRecent.value = true
    error.value = null
    try {
      const response = await apiFetch<NotificationsResponse>('/v1/notifications', {
        query: { page: 1, limit: 10, status: 'all' }
      })
      recent.value = response.data
      unreadCount.value = response.unreadCount
    } catch (cause: any) {
      error.value = cause?.data?.message ?? 'Notificarile nu au putut fi incarcate.'
    } finally {
      loadingRecent.value = false
    }
  }

  async function fetchPage(params: { page: number, limit: number, status: 'all' | 'unread', search?: string }) {
    return apiFetch<NotificationsResponse>('/v1/notifications', { query: params })
  }

  async function setRead(notificationId: string, isRead: boolean) {
    const response = await apiFetch<{ data: AppNotification }>(`/v1/notifications/${notificationId}/read`, {
      method: 'PATCH',
      body: { isRead }
    })
    const index = recent.value.findIndex(item => item.id_notification === notificationId)
    if (index >= 0) recent.value[index] = { ...recent.value[index], ...response.data }
    unreadCount.value = Math.max(0, unreadCount.value + (isRead ? -1 : 1))
    return response.data
  }

  async function markAllRead() {
    await apiFetch('/v1/notifications/read-all', { method: 'PATCH' })
    recent.value = recent.value.map(item => ({
      ...item,
      is_read: true,
      date_read: item.date_read ?? new Date().toISOString()
    }))
    unreadCount.value = 0
  }

  watch(() => session.value?.profileId, (profileId, previous) => {
    if (profileId && profileId !== previous) {
      recent.value = []
      unreadCount.value = 0
      fetchUnreadCount()
    }
  })

  return {
    recent,
    unreadCount,
    loadingRecent,
    error,
    fetchUnreadCount,
    fetchRecent,
    fetchPage,
    setRead,
    markAllRead
  }
}

export const useNotifications = createSharedComposable(_useNotifications)
