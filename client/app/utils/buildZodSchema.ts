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
      rule = z.string({ message: `"${field.name}" este obligatoriu` })
        .transform((val) => {
          // Dacă e deja format YYYY-MM-DD, returnează direct
          if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val
          // Altfel, convertește din format ISO (YYYY-MM-DDTHH:mm:ss.sssZ)
          const date = new Date(val)
          if (isNaN(date.getTime())) return val // Lasă să eșueze validarea
          const year = date.getFullYear()
          const month = String(date.getMonth() + 1).padStart(2, '0')
          const day = String(date.getDate()).padStart(2, '0')
          return `${year}-${month}-${day}`
        })
        .pipe(z.string().date({ message: 'Format dată invalid (YYYY-MM-DD)' }))
      break

    case 'timestamp':
      rule = z.string({ message: `"${field.name}" este obligatoriu` }).datetime({ offset: true, message: 'Format dată/oră invalid' })
      break

    case 'uuid':
      rule = z.string({ message: `"${field.name}" este obligatoriu` }).uuid({ message: 'Valoare invalidă' })
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
  let rule = z.coerce.number({ message: requiredMessage }).int({ message: 'Valoare trebuie să fie un număr întreg' })
  const v = field.validation_rules

  if (v?.min != null) rule = rule.min(v.min, { message: `Valoarea minimă este ${v.min}` })
  if (v?.max != null) rule = rule.max(v.max, { message: `Valoarea maximă este ${v.max}` })

  return rule
}

function buildNumericRule(field: Field) {
  const requiredMessage = `"${field.name}" este obligatoriu`
  let rule = z.coerce.number({ message: requiredMessage })
  const v = field.validation_rules

  if (v?.min != null) rule = rule.min(v.min, { message: `Valoarea minimă este ${v.min}` })
  if (v?.max != null) rule = rule.max(v.max, { message: `Valoarea maximă este ${v.max}` })

  return rule
}
