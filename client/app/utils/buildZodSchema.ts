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

    case 'datetime':
      rule = z.string({ message: `"${field.name}" este obligatoriu` })
        .transform((val) => {
          // Deja un ISO datetime complet cu timezone offset
          if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)$/.test(val)) return val
          // Date-only format (YYYY-MM-DD) — adaugă T00:00:00Z
          if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return `${val}T00:00:00.000Z`
          // Fallback: parse nativ Date
          const date = new Date(val)
          if (isNaN(date.getTime())) return val
          return date.toISOString()
        })
        .pipe(z.string().datetime({ offset: true, message: 'Format dată/oră invalid' }))
      break

    case 'uuid':
      rule = z.string({ message: `"${field.name}" este obligatoriu` }).uuid({ message: 'Valoare invalidă' })
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
  const requiredMessage = `"${field.name}" este obligatoriu`
  let rule = z.string({ message: requiredMessage })
  const v = field.validation_rules

  if (field.is_required) {
    rule = rule.min(1, { message: requiredMessage })
  }
  if (v?.min_length != null) rule = rule.min(v.min_length, { message: `Minim ${v.min_length} caractere` })
  if (v?.max_length != null) rule = rule.max(v.max_length, { message: `Maxim ${v.max_length} caractere` })
  if (v?.pattern) {
    const message = v?.error_message || `"${field.name}" nu are formatul corect`
    rule = rule.regex(new RegExp(v.pattern), { message })
  }
  return rule
}

function buildIntegerRule(field: Field) {
  const requiredMessage = `"${field.name}" este obligatoriu`
  let rule = z.number({ message: requiredMessage }).int({ message: 'Valoare trebuie să fie un număr întreg' })
  const v = field.validation_rules

  if (v?.min != null) rule = rule.min(v.min, { message: `Valoarea minimă este ${v.min}` })
  if (v?.max != null) rule = rule.max(v.max, { message: `Valoarea maximă este ${v.max}` })

  return buildNumberRule(field, rule)
}

function buildNumericRule(field: Field) {
  const requiredMessage = `"${field.name}" este obligatoriu`
  let rule = z.number({ message: requiredMessage })
  const v = field.validation_rules

  if (v?.min != null) rule = rule.min(v.min, { message: `Valoarea minimă este ${v.min}` })
  if (v?.max != null) rule = rule.max(v.max, { message: `Valoarea maximă este ${v.max}` })

  return buildNumberRule(field, rule)
}

function buildNumberRule(field: Field, rule: z.ZodNumber) {
  const preprocessNumber = (value: unknown) => {
    if (value === undefined || value === null || value === '') return undefined
    if (typeof value === 'string' && value.trim() === '') return undefined
    return Number(value)
  }

  return z.preprocess(preprocessNumber, field.is_required ? rule : rule.optional())
}
