import { SetMetadata } from '@nestjs/common';
import type {
  IntegrationResource,
  IntegrationScope,
} from './integration-token.types';

export const INTEGRATION_RESOURCE_KEY = 'integration_resource';
export const INTEGRATION_SCOPE_KEY = 'integration_scope';

export const IntegrationAccess = (resource: IntegrationResource) =>
  SetMetadata(INTEGRATION_RESOURCE_KEY, resource);

export const RequireIntegrationScope = (scope: IntegrationScope) =>
  SetMetadata(INTEGRATION_SCOPE_KEY, scope);
