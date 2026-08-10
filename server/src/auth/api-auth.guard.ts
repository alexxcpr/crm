import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { AuthenticatedUser } from 'src/security/security.types';
import {
  INTEGRATION_RESOURCE_KEY,
  INTEGRATION_SCOPE_KEY,
} from './integration-access.decorator';
import type {
  IntegrationResource,
  IntegrationScope,
} from './integration-token.types';

const RESOURCE_SCOPES: Record<
  IntegrationResource,
  { read: IntegrationScope; write: IntegrationScope }
> = {
  builder: { read: 'builder:read', write: 'builder:write' },
  data: { read: 'data:read', write: 'data:write' },
  files: { read: 'files:read', write: 'files:write' },
  integrations: {
    read: 'integrations:read',
    write: 'integrations:write',
  },
};

@Injectable()
export class ApiAuthGuard extends AuthGuard([
  'integration-token',
  'jwt',
]) {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const allowed = await super.canActivate(context);
    if (!allowed) return false;

    const request = context.switchToHttp().getRequest<{
      method: string;
      user: AuthenticatedUser;
    }>();
    const user = request.user;
    if (user.authType !== 'integration_token') return true;

    const exactScope = this.reflector.getAllAndOverride<IntegrationScope>(
      INTEGRATION_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    const resource = this.reflector.getAllAndOverride<IntegrationResource>(
      INTEGRATION_RESOURCE_KEY,
      [context.getHandler(), context.getClass()],
    );
    const required = integrationScopeFor(resource, request.method, exactScope);

    if (!required || !user.integrationScopes?.includes(required)) {
      throw new ForbiddenException(
        required
          ? `Token-ul de integrare necesita scope-ul "${required}".`
          : 'Token-urile de integrare nu sunt permise pe aceasta ruta.',
      );
    }
    return true;
  }
}

export function integrationScopeFor(
  resource: IntegrationResource | undefined,
  method: string,
  exact?: IntegrationScope,
): IntegrationScope | null {
  if (exact) return exact;
  if (!resource) return null;
  const isRead = ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
  return RESOURCE_SCOPES[resource][isRead ? 'read' : 'write'];
}
