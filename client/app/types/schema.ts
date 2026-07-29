// ─── Field Definition (exact ce returneaza GET /api/v1/schema/:entitySlug) ───

export interface Field {
  id_field: string
  slug: string
  name: string
  column_name: string
  data_type: 'varchar' | 'text' | 'integer' | 'numeric' | 'boolean' | 'datetime' | 'uuid'
  ui_type: 'text' | 'textarea' | 'number' | 'datepicker' | 'datetimepicker' | 'checkbox' | 'relation' | 'email' | 'phone' | 'currency' | 'file'
  default_value: string | null
  placeholder: string | null
  help_text: string | null
  options: { label: string, value: string }[] | null
  is_required: boolean
  is_unique: boolean
  is_filterable: boolean
  is_sortable: boolean
  visible_in_table: boolean
  visible_in_form: boolean
  is_system: boolean
  is_readonly: boolean
  validation_rules: Record<string, any> | null
  id_relation_entity: string | null
  relation_kind: 'reference' | 'composition' | null
  relation_display_field: string | null
  relation_entity_slug: string | null
  id_ui_tab: string
  tab_slug: string | null
  rank: number
  grid_col: number
  col_span: number
}

export interface EntityMeta {
  id_entity: string
  slug: string
  name: string
  table_name: string
  label_singular: string | null
  label_plural: string | null
  icon: string | null
  is_system: boolean
  module: string | null
}

export interface UiTab {
  id_ui_tab: string
  id_entity: string
  name: string
  slug: string
  rank: number
  is_system: boolean
  content_type: 'fields' | 'related_collection'
  related_collection: RelatedCollectionDefinition | null
  date_created: string
  date_updated: string
}

export interface RelatedCollectionCardField {
  id_field: string
  name: string
  slug: string
  column_name: string
  ui_type: Field['ui_type']
  rank: number
}

export interface RelatedCollectionDefinition {
  id_related_collection: string
  relation_field_id: string
  relation_field_slug: string
  relation_column_name: string
  relation_kind: 'reference' | 'composition'
  child_entity_id: string
  child_entity_slug: string
  child_entity_name: string
  child_label_singular: string | null
  child_label_plural: string | null
  default_view: 'table' | 'cards'
  allow_table: boolean
  allow_cards: boolean
  card_title_field_id: string | null
  card_title_field_slug: string | null
  card_title_column_name: string | null
  card_fields: RelatedCollectionCardField[]
  page_size: number
  default_sort: string
  allow_create: boolean
  allow_update: boolean
  allow_delete: boolean
  quick_add_mode: 'none' | 'multi_file'
  id_quick_add_file_field: string | null
  quick_add_file_field_slug: string | null
  capabilities: Pick<EntityCapabilities, 'read' | 'create' | 'update' | 'delete'>
}

export interface EntitySchema {
  entity: EntityMeta
  fields: Field[]
  tabs: UiTab[]
  capabilities: EntityCapabilities
}

export type PermissionScope = 'all' | 'owner' | null
export interface EntityCapabilities {
  read: PermissionScope
  create: PermissionScope
  update: PermissionScope
  delete: PermissionScope
  manage: PermissionScope
  change_ownership: PermissionScope
}

// ─── Response-uri de la GET /api/v1/data/:entitySlug ───

export interface PaginationMeta {
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface PaginatedResponse<T = Record<string, any>> {
  data: T[]
  meta: PaginationMeta
}

export interface SingleResponse<T = Record<string, any>> {
  data: T
}

// ─── Parametri pentru query-uri ───

export interface FetchParams {
  page?: number
  limit?: number
  sort?: string
  filter?: Record<string, any>
}
