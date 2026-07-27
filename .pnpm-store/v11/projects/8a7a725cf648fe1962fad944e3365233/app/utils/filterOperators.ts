import type { ColumnFilters, FilterCondition, FilterOperatorOption } from '~/types/filters'
import type { Field } from '~/types/schema'

type FilterField = Pick<Field, 'column_name' | 'data_type' | 'ui_type'> & {
  name?: string
}

type FilterSummaryOptions = {
  resolveValueLabel?: (field: FilterField, value: string) => string | undefined
}

export function getFilterOperators(field: FilterField): FilterOperatorOption[] {
  if (field.ui_type === 'relation') {
    return [
      { label: 'Este', value: 'eq', valueKind: 'relation' },
      { label: 'Este unul din', value: 'in', valueKind: 'relation-multiple' },
      { label: 'Necompletat', value: 'is_null', valueKind: 'none', defaultValue: true },
      { label: 'Completat', value: 'is_null', valueKind: 'none', defaultValue: false }
    ]
  }

  if (field.data_type === 'boolean') {
    return [
      { label: 'Da', value: 'eq', valueKind: 'boolean', defaultValue: true },
      { label: 'Nu', value: 'eq', valueKind: 'boolean', defaultValue: false },
      { label: 'Necompletat', value: 'is_null', valueKind: 'none', defaultValue: true },
      { label: 'Completat', value: 'is_null', valueKind: 'none', defaultValue: false }
    ]
  }

  if (['integer', 'numeric'].includes(field.data_type)) {
    return [
      { label: 'Egal', value: 'eq', valueKind: 'number' },
      { label: 'Mai mare', value: 'gt', valueKind: 'number' },
      { label: 'Mai mare sau egal', value: 'gte', valueKind: 'number' },
      { label: 'Mai mic', value: 'lt', valueKind: 'number' },
      { label: 'Mai mic sau egal', value: 'lte', valueKind: 'number' },
      { label: 'Între', value: 'between', valueKind: 'range' },
      { label: 'Necompletat', value: 'is_null', valueKind: 'none', defaultValue: true },
      { label: 'Completat', value: 'is_null', valueKind: 'none', defaultValue: false }
    ]
  }

  if (field.data_type === 'datetime') {
    const valueKind = field.ui_type === 'datetimepicker' ? 'datetime' : 'date'
    return [
      { label: 'Egal', value: 'eq', valueKind },
      { label: 'După', value: 'gt', valueKind },
      { label: 'După sau egal', value: 'gte', valueKind },
      { label: 'Înainte', value: 'lt', valueKind },
      { label: 'Înainte sau egal', value: 'lte', valueKind },
      { label: 'Între', value: 'between', valueKind: 'range' },
      { label: 'Necompletat', value: 'is_null', valueKind: 'none', defaultValue: true },
      { label: 'Completat', value: 'is_null', valueKind: 'none', defaultValue: false }
    ]
  }

  return [
    { label: 'Conține', value: 'contains', valueKind: 'text' },
    { label: 'Începe cu', value: 'starts_with', valueKind: 'text' },
    { label: 'Egal', value: 'eq', valueKind: 'text' },
    { label: 'Necompletat', value: 'is_null', valueKind: 'none', defaultValue: true },
    { label: 'Completat', value: 'is_null', valueKind: 'none', defaultValue: false }
  ]
}

export function createFilterCondition(field: FilterField): FilterCondition {
  const operator = getFilterOperators(field)[0]
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `filter-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    column: field.column_name,
    operator: operator?.value ?? 'eq',
    value: operator?.defaultValue ?? null
  }
}

export function isFilterConditionComplete(condition: FilterCondition, field: FilterField): boolean {
  const operator = getFilterOperators(field).find(item => item.value === condition.operator)
  if (!operator) return false
  if (operator.valueKind === 'none') return typeof condition.value === 'boolean'
  if (operator.valueKind === 'relation-multiple') return Array.isArray(condition.value) && condition.value.length > 0
  if (operator.valueKind === 'range') {
    return Array.isArray(condition.value)
      && condition.value.length === 2
      && condition.value.every(value => value !== null && value !== undefined && value !== '')
  }
  return condition.value !== null && condition.value !== undefined && condition.value !== ''
}

export function buildApiFilters(filters: ColumnFilters, fields: FilterField[]): Record<string, unknown> {
  const fieldMap = new Map(fields.map(field => [field.column_name, field]))
  const result: Record<string, unknown> = {}

  for (const [column, conditions] of Object.entries(filters)) {
    const field = fieldMap.get(column)
    if (!field) continue

    const activeConditions = conditions
      .filter(condition => isFilterConditionComplete(condition, field))
      .map(condition => ({
        op: condition.operator,
        value: serializeFilterValue(condition.value)
      }))

    if (activeConditions.length > 0) {
      result[column] = activeConditions
    }
  }

  return result
}

export function countActiveFilterConditions(filters: ColumnFilters, fields: FilterField[]): number {
  const fieldMap = new Map(fields.map(field => [field.column_name, field]))
  return Object.values(filters).reduce((total, conditions) => {
    return total + conditions.filter((condition) => {
      const field = fieldMap.get(condition.column)
      return field ? isFilterConditionComplete(condition, field) : false
    }).length
  }, 0)
}

export function getActiveFilterConditions(conditions: FilterCondition[], field: FilterField): FilterCondition[] {
  return conditions.filter(condition => isFilterConditionComplete(condition, field))
}

export function summarizeFilterConditions(
  conditions: FilterCondition[],
  field: FilterField,
  options: FilterSummaryOptions = {}
): string {
  const activeConditions = getActiveFilterConditions(conditions, field)
  const firstCondition = activeConditions[0]
  if (!firstCondition) return ''

  const operator = getFilterOperators(field).find(item => item.value === firstCondition.operator)
  if (!operator) return ''

  const base = formatConditionSummary(firstCondition, operator, field, options)
  const extraCount = activeConditions.length - 1
  return extraCount > 0 ? `${base} +${extraCount}` : base
}

function serializeFilterValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.join(',')
  return value
}

function formatConditionSummary(
  condition: FilterCondition,
  operator: FilterOperatorOption,
  field: FilterField,
  options: FilterSummaryOptions
): string {
  if (operator.valueKind === 'none') return operator.label

  if (operator.valueKind === 'range' && Array.isArray(condition.value)) {
    const [from, to] = condition.value
    return `${operator.label}: ${formatFilterValue(from, field, options)} - ${formatFilterValue(to, field, options)}`
  }

  if (operator.valueKind === 'relation-multiple' && Array.isArray(condition.value)) {
    return `${operator.label}: ${condition.value.map(value => formatFilterValue(value, field, options)).join(', ')}`
  }

  return `${operator.label}: ${formatFilterValue(condition.value, field, options)}`
}

function formatFilterValue(value: unknown, field: FilterField, options: FilterSummaryOptions): string {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'boolean') return value ? 'Da' : 'Nu'
  if (Array.isArray(value)) return value.map(item => formatFilterValue(item, field, options)).join(', ')

  const text = String(value)
  if (field.ui_type === 'relation') {
    return options.resolveValueLabel?.(field, text) ?? text
  }

  if (field.data_type === 'datetime') {
    return field.ui_type === 'datetimepicker' ? formatFilterDateTime(text) : formatFilterDate(text)
  }

  return text
}

function formatFilterDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) return `${match[3]}.${match[2]}.${match[1]}`
  return value
}

function formatFilterDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return formatFilterDate(value)

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')

  return `${day}.${month}.${year} ${hour}:${minute}`
}
