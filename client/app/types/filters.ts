import type { Field } from './schema'

export type FilterOperator =
  | 'eq'
  | 'contains'
  | 'starts_with'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'in'
  | 'is_null'

export type FilterValueKind =
  | 'text'
  | 'number'
  | 'date'
  | 'datetime'
  | 'boolean'
  | 'relation'
  | 'relation-multiple'
  | 'range'
  | 'none'

export interface FilterOperatorOption {
  label: string
  value: FilterOperator
  valueKind: FilterValueKind
  defaultValue?: unknown
}

export interface FilterCondition {
  id: string
  column: string
  operator: FilterOperator
  value: unknown
}

export type ColumnFilters = Record<string, FilterCondition[]>

export interface FilterableSystemField extends Pick<Field, 'name' | 'column_name' | 'data_type' | 'ui_type'> {
  id_field: string
  slug: string
  is_filterable: boolean
  visible_in_table: boolean
}
