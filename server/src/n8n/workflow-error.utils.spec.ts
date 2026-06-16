import {
  extractValidationError,
  withValidationPrefix,
} from './workflow-error.utils';

describe('workflow-error utils', () => {
  it('prefixeaza mesajele de validare', () => {
    expect(withValidationPrefix('Camp obligatoriu')).toBe(
      '[MODUVIS_VALIDATION] Camp obligatoriu',
    );
  });

  it('curata mesajele prefixate direct', () => {
    expect(
      extractValidationError('[MODUVIS_VALIDATION] Camp obligatoriu'),
    ).toBe('Camp obligatoriu');
  });

  it('curata mesajele prefixate de n8n', () => {
    expect(
      extractValidationError('n8n: [MODUVIS_VALIDATION] Camp obligatoriu'),
    ).toBe('Camp obligatoriu');
  });

  it('ignora erorile fara sentinel de validare', () => {
    expect(extractValidationError('n8n: Error in workflow')).toBeNull();
  });
});
