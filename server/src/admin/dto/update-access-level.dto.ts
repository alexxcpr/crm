import { IsIn } from 'class-validator';
import type { AccessLevel } from 'src/security/access-control.types';

export class UpdateAccessLevelDto {
  @IsIn(['tenant_admin', 'user'])
  accessLevel: Exclude<
    AccessLevel,
    'platform_owner'
  >;
}
