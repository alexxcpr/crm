import { z, type ZodType } from 'zod'
import type { Field } from '~/types/schema'

export function buildZodSchema(fields: Field[]) {
  const shape: Record<string, ZodType> = {}

  for (const field of fields) {
    shape[field.slug] = buildFieldRule(field)
  }

  return z.object(shape)
}

function buildFieldRule(field: Field): ZodType {
  let rule: ZodType

  switch (field.data_type) {
    case 'varchar':
    case 'text':
      rule = buildStringRule(field)
      break

    case 'integer':
      rule = buildIntegerRule(field)
      break

    case 'numeric':
      rule = buildNumericRule(field)
      break

    case 'boolean':
      rule = z.coerce.boolean()
      break

    case 'date':
      rule = z.string().date()
      break

    case 'timestamp':
      rule = z.string().datetime({ offset: true })
      break

    case 'uuid':
      rule = z.string().uuid()
      break

    case 'jsonb':
      rule = z.any()
      break

    default:
      rule = z.string()
  }

  if (!field.is_required) {
    rule = rule.optional().nullable()
  }

  return rule
}

function buildStringRule(field: Field): z.ZodString {
  let rule = z.string()
  const v = field.validation_rules

  if (v?.min_length != null) rule = rule.min(v.min_length)
  if (v?.max_length != null) rule = rule.max(v.max_length)
  if (v?.pattern) rule = rule.regex(new RegExp(v.pattern))

  return rule
}

function buildIntegerRule(field: Field) {
  let rule = z.coerce.number().int()
  const v = field.validation_rules

  if (v?.min != null) rule = rule.min(v.min)
  if (v?.max != null) rule = rule.max(v.max)

  return rule
}

function buildNumericRule(field: Field) {
  let rule = z.coerce.number()
  const v = field.validation_rules

  if (v?.min != null) rule = rule.min(v.min)
  if (v?.max != null) rule = rule.max(v.max)

  return rule
}
