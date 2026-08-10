export const INTEGRATION_SCOPES = [
  'builder:read',
  'builder:write',
  'data:read',
  'data:write',
  'actions:execute',
  'files:read',
  'files:write',
  'integrations:read',
  'integrations:write',
] as const;

export type IntegrationScope =
  (typeof INTEGRATION_SCOPES)[number];

export type IntegrationResource =
  | 'builder'
  | 'data'
  | 'files'
  | 'integrations';

export interface IntegrationAccessPolicy {
  read: IntegrationScope;
  write: IntegrationScope;
}
