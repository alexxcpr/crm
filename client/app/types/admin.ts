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
  options?: { label: string; value: string }[]
  is_required?: boolean
  is_unique?: boolean
  is_filterable?: boolean
  is_sortable?: boolean
  visible_in_table?: boolean
  visible_in_form?: boolean
  validation_rules?: Record<string, any>
  id_relation_entity?: string
  relation_display_field?: string
  group_name?: string
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
  options?: { label: string; value: string }[]
  id_relation_entity?: string
  relation_display_field?: string
  is_required?: boolean
  is_unique?: boolean
  is_filterable?: boolean
  is_sortable?: boolean
  visible_in_table?: boolean
  visible_in_form?: boolean
  validation_rules?: Record<string, any>
  group_name?: string
  rank?: number
  grid_col?: number
  col_span?: number
}
