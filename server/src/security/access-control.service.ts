import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from './security.types';
import {
  ACCESS_LEVEL_CAPABILITIES,
  ACCESS_LEVELS,
  type AccessLevel,
  type GlobalCapability,
} from './access-control.types';

@Injectable()
export class AccessControlService {
  normalizeAccessLevel(
    value: unknown,
  ): AccessLevel {
    return ACCESS_LEVELS.includes(
      value as AccessLevel,
    )
      ? (value as AccessLevel)
      : 'user';
  }

  capabilitiesFor(
    accessLevel: AccessLevel,
  ): GlobalCapability[] {
    return [
      ...ACCESS_LEVEL_CAPABILITIES[accessLevel],
    ];
  }

  has(
    actor:
      | Pick<
          AuthenticatedUser,
          'accessLevel' | 'globalCapabilities'
        >
      | null
      | undefined,
    capability: GlobalCapability,
  ): boolean {
    if (!actor) return false;
    return ACCESS_LEVEL_CAPABILITIES[
      this.normalizeAccessLevel(
        actor.accessLevel,
      )
    ].includes(capability);
  }
}
