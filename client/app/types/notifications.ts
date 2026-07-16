export interface AppNotification {
  id_notification: string
  subject: string
  content: string
  is_read: boolean
  date_read: string | null
  target_entity_slug: string | null
  target_record_id: string | null
  date_created: string
  date_updated: string
}

export interface NotificationsResponse {
  data: AppNotification[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
  unreadCount: number
}
