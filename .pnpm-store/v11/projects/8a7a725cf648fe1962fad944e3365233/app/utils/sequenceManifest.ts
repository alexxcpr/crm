export type SequenceScope = 'entity' | 'global'
export type SequenceReset = 'none' | 'yearly'

export interface SequenceConfiguration {
  key: string
  scope: SequenceScope
  reset: SequenceReset
  format: string
  prefix: string
  padding: number
  start_value: number
}

export interface SequenceValidationIssue {
  field: keyof SequenceConfiguration
  message: string
}

const ALLOWED_TOKENS = new Set(['prefix', 'number', 'day', 'month', 'year'])
const KNOWN_TOKEN_PATTERN = /\{(prefix|number|day|month|year)\}/g

export function suggestSequenceKey(entitySlug: string | null | undefined, fieldSlug: string) {
  const parts = [entitySlug?.trim(), fieldSlug.trim()].filter(Boolean)
  return parts.join('_').slice(0, 51)
}

export function validateSequenceConfiguration(
  configuration: SequenceConfiguration
): SequenceValidationIssue[] {
  const issues: SequenceValidationIssue[] = []
  const key = configuration.key.trim()

  if (!/^[a-z][a-z0-9_]{1,50}$/.test(key)) {
    issues.push({
      field: 'key',
      message: 'Cheia poate contine doar litere mici, cifre si _ si trebuie sa inceapa cu o litera.'
    })
  }

  if (!['entity', 'global'].includes(configuration.scope)) {
    issues.push({ field: 'scope', message: 'Scope-ul trebuie sa fie entity sau global.' })
  }

  if (!['none', 'yearly'].includes(configuration.reset)) {
    issues.push({ field: 'reset', message: 'Resetarea trebuie sa fie none sau yearly.' })
  }

  if (!configuration.format || configuration.format.length > 255) {
    issues.push({
      field: 'format',
      message: 'Formatul trebuie sa aiba intre 1 si 255 de caractere.'
    })
  }

  const tokens = [...configuration.format.matchAll(/\{([^{}]+)\}/g)].map(match => match[1])
  if (tokens.filter(token => token === 'number').length !== 1) {
    issues.push({
      field: 'format',
      message: 'Formatul trebuie sa contina exact un token {number}.'
    })
  }

  if (tokens.some(token => !ALLOWED_TOKENS.has(token ?? ''))) {
    issues.push({
      field: 'format',
      message: 'Formatul contine tokenuri necunoscute.'
    })
  }

  const withoutKnownTokens = configuration.format.replace(KNOWN_TOKEN_PATTERN, '')
  if (/[{}]/.test(withoutKnownTokens)) {
    issues.push({
      field: 'format',
      message: 'Formatul contine acolade neinchise sau tokenuri invalide.'
    })
  }

  if (configuration.reset === 'yearly' && !tokens.includes('year')) {
    issues.push({
      field: 'format',
      message: 'O secventa cu resetare anuala trebuie sa includa tokenul {year}.'
    })
  }

  if (configuration.prefix.length > 100 || /[{}]/.test(configuration.prefix)) {
    issues.push({
      field: 'prefix',
      message: 'Prefixul poate avea maximum 100 de caractere si nu poate contine acolade.'
    })
  }

  if (!Number.isSafeInteger(configuration.padding)
    || configuration.padding < 1
    || configuration.padding > 18) {
    issues.push({
      field: 'padding',
      message: 'Padding-ul trebuie sa fie un numar intreg intre 1 si 18.'
    })
  }

  if (!Number.isSafeInteger(configuration.start_value) || configuration.start_value < 1) {
    issues.push({
      field: 'start_value',
      message: 'Valoarea initiala trebuie sa fie un numar intreg pozitiv sigur.'
    })
  }

  if (issues.length === 0) {
    const maximumNumber = '9223372036854775807'.padStart(configuration.padding, '0')
    const maximumValues: Record<string, string> = {
      prefix: configuration.prefix,
      number: maximumNumber,
      day: '31',
      month: '12',
      year: '9999'
    }
    const maximumValue = configuration.format.replace(
      KNOWN_TOKEN_PATTERN,
      (_, token: string) => maximumValues[token] ?? ''
    )
    if (maximumValue.length > 255) {
      issues.push({
        field: 'format',
        message: 'Formatul poate produce valori mai lungi de 255 de caractere.'
      })
    }
  }

  return issues
}

export function renderSequencePreview(configuration: SequenceConfiguration, date = new Date()) {
  const number = Number.isSafeInteger(configuration.start_value) && configuration.start_value >= 0
    ? String(configuration.start_value).padStart(configuration.padding, '0')
    : String(configuration.start_value)
  const values: Record<string, string> = {
    prefix: configuration.prefix,
    number,
    day: String(date.getDate()).padStart(2, '0'),
    month: String(date.getMonth() + 1).padStart(2, '0'),
    year: String(date.getFullYear()).padStart(4, '0')
  }

  return configuration.format.replace(KNOWN_TOKEN_PATTERN, (_, token: string) => values[token] ?? '')
}
