import type { DashboardDrilldown } from '~/types/dashboard'
import type { ColumnFilters, FilterCondition } from '~/types/filters'

export function dashboardDrilldownRoute(drilldown: DashboardDrilldown) {
  const query: Record<string, string> = {}
  drilldown.filters.forEach((filter, index) => {
    query[`filter[${filter.field}][${index}][op]`] = filter.op
    query[`filter[${filter.field}][${index}][value]`] = Array.isArray(filter.value)
      ? filter.value.join(',')
      : String(filter.value ?? '')
  })
  return { path: `/${drilldown.entitySlug}`, query }
}

export function parseDashboardRouteFilters(query: Record<string, unknown>): ColumnFilters {
  const output: ColumnFilters = {}
  const pattern = /^filter\[([^\]]+)]\[(\d+)]\[(op|value)]$/
  const parts = new Map<string, Partial<Record<'op' | 'value', string>>>()

  for (const [key, rawValue] of Object.entries(query)) {
    const match = key.match(pattern)
    if (!match) continue
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue
    if (typeof value !== 'string') continue
    const partKey = `${match[1]}:${match[2]}`
    const current = parts.get(partKey) ?? {}
    current[match[3] as 'op' | 'value'] = value
    parts.set(partKey, current)
  }

  for (const [key, part] of parts) {
    if (!part.op) continue
    const [column, index] = key.split(':')
    const condition: FilterCondition = {
      id: `dashboard-${column}-${index}`,
      column: column!,
      operator: part.op as FilterCondition['operator'],
      value: normalizeRouteFilterValue(part.op, part.value ?? '')
    }
    if (!output[column!]) output[column!] = []
    output[column!]!.push(condition)
  }
  return output
}

function normalizeRouteFilterValue(operator: string, value: string): unknown {
  if (operator === 'between' || operator === 'in') return value.split(',')
  if (operator === 'is_null') return value === 'true'
  return value
}
