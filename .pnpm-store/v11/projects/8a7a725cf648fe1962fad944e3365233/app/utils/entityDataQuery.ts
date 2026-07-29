import type { FetchParams } from '~/types/schema'

export function buildEntityDataQuery(params: FetchParams): Record<string, string> {
  const query: Record<string, string> = {}

  if (params.page) query.page = String(params.page)
  if (params.limit) query.limit = String(params.limit)
  if (params.sort) query.sort = params.sort

  if (!params.filter) return query

  for (const [key, value] of Object.entries(params.filter)) {
    if (value === null || value === undefined || value === '') continue

    if (Array.isArray(value)) {
      value.forEach((condition, index) => {
        if (typeof condition !== 'object' || condition === null) return
        const op = condition.op ?? condition.operator
        const val = condition.value
        if (!op || val === null || val === undefined || val === '') return
        query[`filter[${key}][${index}][op]`] = String(op)
        query[`filter[${key}][${index}][value]`] = String(val)
      })
    } else if (typeof value === 'object') {
      for (const [op, val] of Object.entries(value)) {
        query[`filter[${key}][${op}]`] = String(val)
      }
    } else {
      query[`filter[${key}]`] = String(value)
    }
  }

  return query
}
