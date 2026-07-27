import { Injectable } from '@nestjs/common';
import { TenantContext } from 'src/tenant/tenant-context.service';

interface AuditInput {
  actorProfileId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
}

@Injectable()
export class TenantAuditService {
  constructor(
    private readonly tenantContext: TenantContext,
  ) {}

  async record(input: AuditInput): Promise<void> {
    await this.tenantContext
      .knex('tenant_audit_log')
      .insert({
        id_actor_profile:
          input.actorProfileId ?? null,
        action: input.action,
        target_type: input.targetType,
        target_id: input.targetId ?? null,
        before_value:
          input.before === undefined
            ? null
            : input.before,
        after_value:
          input.after === undefined
            ? null
            : input.after,
      });
  }
}
