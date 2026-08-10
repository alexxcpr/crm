import { integrationScopeFor } from './api-auth.guard';

describe('integrationScopeFor', () => {
  it('separa scope-urile read si write', () => {
    expect(integrationScopeFor('builder', 'GET')).toBe('builder:read');
    expect(integrationScopeFor('builder', 'POST')).toBe('builder:write');
    expect(integrationScopeFor('data', 'DELETE')).toBe('data:write');
  });

  it('respecta override-ul exact pentru execute', () => {
    expect(integrationScopeFor('data', 'POST', 'actions:execute')).toBe(
      'actions:execute',
    );
  });

  it('refuza implicit rutele fara politica', () => {
    expect(integrationScopeFor(undefined, 'GET')).toBeNull();
  });
});
