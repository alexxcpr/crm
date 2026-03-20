// ─── Field Definition (exact ce returneaza GET /api/v1/schema/:entitySlug) ───

export interface Field {
    id_field: string
    slug: string
    name: string
    column_name: string
    data_type: 'varchar' | 'text' | 'integer' | 'numeric' | 'boolean' | 'date' | 'timestamp' | 'uuid' | 'jsonb'
    ui_type: 'text' | 'textarea' | 'number' | 'select' | 'multi-select' | 'datepicker' | 'checkbox' | 'radio' | 'relation' | 'email' | 'phone' | 'currency' | 'file'
    default_value: string | null
    placeholder: string | null
    help_text: string | null
    options: { label: string; value: string }[] | null
    is_required: boolean
    is_unique: boolean
    is_filterable: boolean
    is_sortable: boolean
    visible_in_table: boolean
    visible_in_form: boolean
    is_system: boolean
    validation_rules: Record<string, any> | null
    id_relation_entity: string | null
    relation_display_field: string | null
    relation_entity_slug: string | null
    group_name: string
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
  
  export interface EntitySchema {
    entity: EntityMeta
    fields: Field[]
    groups: string[]
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