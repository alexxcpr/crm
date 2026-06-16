export const VALIDATION_ERROR_PREFIX = '[MODUVIS_VALIDATION] ';

export function withValidationPrefix(message?: string | null): string {
  const cleanMessage = String(message ?? '').trim() || 'Validare esuata';
  return `${VALIDATION_ERROR_PREFIX}${cleanMessage}`;
}

export function extractValidationError(message?: string | null): string | null {
  if (!message) return null;

  const text = String(message);
  const index = text.indexOf(VALIDATION_ERROR_PREFIX);
  if (index === -1) return null;

  const cleanMessage = text.slice(index + VALIDATION_ERROR_PREFIX.length).trim();
  return cleanMessage || 'Validare esuata';
}
