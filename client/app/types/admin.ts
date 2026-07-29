import type { Field } from './schema'

// ─── Module ───

export interface AdminModule {
  id_module: string
  name: string
  slug: string
  icon: string | null
  rank: number
  is_active: boolean
  date_created: string
  date_updated: string
  entities?: AdminEntity[]
}

export interface ModulePayload {
  name: string
  slug: string
  icon?: string
  rank?: number
  is_active?: boolean
}

// ─── Entity ───

export interface AdminEntity {
  id_entity: string
  name: string
  slug: string
  table_name: string
  id_module: string | null
  icon: string | null
  is_system: boolean
  label_singular: string | null
  label_plural: string | null
  rank: number
  date_created: string
  date_updated: string
  module?: AdminModule | null
  fields?: Field[]
}

export interface CreateEntityPayload {
  name: string
  slug: string
  id_module?: string
  icon?: string
  label_singular?: string
  label_plural?: string
  rank?: number
}

export interface UpdateEntityPayload {
  name?: string
  id_module?: string
  icon?: string
  label_singular?: string
  label_plural?: string
  rank?: number
}

// ─── Field ───

export interface FieldPayload {
  name: string
  slug: string
  data_type: Field['data_type']
  ui_type: Field['ui_type']
  default_value?: string
  placeholder?: string
  help_text?: string
  options?: { label: string, value: string }[]
  is_required?: boolean
  is_unique?: boolean
  is_filterable?: boolean
  is_sortable?: boolean
  visible_in_table?: boolean
  visible_in_form?: boolean
  is_readonly?: boolean
  validation_rules?: Record<string, any>
  id_relation_entity?: string
  relation_kind?: 'reference' | 'composition'
  relation_display_field?: string
  id_ui_tab?: string
  rank?: number
  grid_col?: number
  col_span?: number
}

export interface UpdateFieldPayload {
  name?: string
  ui_type?: Field['ui_type']
  placeholder?: string
  help_text?: string
  default_value?: string
  options?: { label: string, value: string }[]
  id_relation_entity?: string
  relation_kind?: 'reference' | 'composition'
  relation_display_field?: string
  is_required?: boolean
  is_unique?: boolean
  is_filterable?: boolean
  is_sortable?: boolean
  visible_in_table?: boolean
  visible_in_form?: boolean
  is_readonly?: boolean
  validation_rules?: Record<string, any>
  id_ui_tab?: string
  rank?: number
  grid_col?: number
  col_span?: number
}

// ─── Tab ───

export interface AdminTab {
  id_ui_tab: string
  id_entity: string
  name: string
  slug: string
  rank: number
  is_system: boolean
  content_type: 'fields' | 'related_collection'
  related_collection?: AdminRelatedCollection | null
  date_created: string
  date_updated: string
  _count?: { fields: number }
}

export interface RelatedCollectionRelationOption {
  id_field: string
  field_name: string
  field_slug: string
  relation_kind: 'reference' | 'composition'
  child_entity_id: string
  child_entity_name: string
  child_entity_slug: string
  fields: Array<{
    id_field: string
    name: string
    slug: string
    column_name: string
    data_type: Field['data_type']
    ui_type: Field['ui_type']
    is_required: boolean
    is_readonly: boolean
    default_value: string | null
  }>
}

export interface AdminRelatedCollection {
  id_relation_field: string
  default_view: 'table' | 'cards'
  allow_table: boolean
  allow_cards: boolean
  card_title_field_id?: string | null
  card_field_ids: string[]
  page_size: number
  default_sort: string
  allow_create: boolean
  allow_update: boolean
  allow_delete: boolean
  quick_add_mode: 'none' | 'multi_file'
  id_quick_add_file_field?: string | null
}

export interface CreateTabPayload {
  name: string
  slug: string
  rank?: number
  is_system?: boolean
  content_type?: 'fields' | 'related_collection'
  related_collection?: AdminRelatedCollection
}

export interface UpdateTabPayload {
  name?: string
  slug?: string
  rank?: number
  related_collection?: AdminRelatedCollection
}

// ─── Menu ───

export type MenuLinkType = 'entity_list' | 'entity_create' | 'entity_record' | 'dashboard' | 'internal_route' | 'external_url'

export interface AdminMenuItem {
  id_menu_item: string
  id_menu: string
  name: string
  icon: string | null
  rank: number
  open_link: string
  link_type: MenuLinkType
  id_entity: string | null
  record_id: string | null
  id_ui_dashboard: string | null
  is_active: boolean
  date_created: string
  date_updated: string
}

export interface AdminMenu {
  id_menu: string
  name: string
  icon: string | null
  rank: number
  is_active: boolean
  date_created: string
  date_updated: string
  items?: AdminMenuItem[]
  _count?: { items: number }
}

export interface MenuPayload {
  name: string
  icon?: string
  rank?: number
  is_active?: boolean
}

export interface MenuItemPayload {
  name: string
  icon?: string
  rank?: number
  open_link: string
  link_type: MenuLinkType
  id_entity?: string
  record_id?: string
  id_ui_dashboard?: string
  is_active?: boolean
}

// Integrations

export type SmtpSecurityMode = 'none' | 'starttls' | 'tls'

export interface SmtpIntegration {
  id_integration: string
  type: 'smtp'
  name: string
  host: string
  port: number
  security: SmtpSecurityMode
  username: string | null
  fromName: string | null
  fromEmail: string
  rejectUnauthorized: boolean
  hasPassword: boolean
  is_active: boolean
  usageCount: number
  date_created: string
  date_updated: string
}

export interface SmtpIntegrationPayload {
  name: string
  host: string
  port: number
  security: SmtpSecurityMode
  username?: string
  password?: string
  clearPassword?: boolean
  fromName?: string
  fromEmail: string
  rejectUnauthorized: boolean
  isActive: boolean
}
