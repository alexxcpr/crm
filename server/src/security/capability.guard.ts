import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessControlService } from './access-control.service';
import type { GlobalCapability } from './access-control.types';
import { CAPABILITIES_KEY } from './require-capability.decorator';
import type { AuthenticatedUser } from './security.types';

@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessControlService,
  ) {}

  canActivate(
    context: ExecutionContext,
  ): boolean {
    const required =
      this.reflector.getAllAndMerge<
        GlobalCapability[]
      >(CAPABILITIES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (!required.length) return true;

    const request =
      context.switchToHttp().getRequest<{
        user?: AuthenticatedUser;
      }>();
    if (!request.user) {
      throw new ForbiddenException(
        'Acces interzis. Autentificare necesara.',
      );
    }
    if (request.user.must_change_password) {
      throw new ForbiddenException(
        'Parola temporara trebuie schimbata inainte de a continua.',
      );
    }
    if (
      !required.every((capability) =>
        this.access.has(request.user, capability),
      )
    ) {
      throw new ForbiddenException(
        'Nu ai acces la aceasta zona.',
      );
    }
    return true;
  }
}
