import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedUser } from 'src/security/security.types';
import { TenantAuditService } from 'src/security/tenant-audit.service';
import { FileStorageService } from 'src/storage/file-storage.service';
import { MetaDbService } from 'src/tenant/meta-db.service';
import { TenantContext } from 'src/tenant/tenant-context.service';
import type { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto';

@Injectable()
export class TenantSettingsService {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly metaDb: MetaDbService,
    private readonly files: FileStorageService,
    private readonly audit: TenantAuditService,
  ) {}

  private get knex() {
    return this.tenantContext.knex;
  }

  async getOrganizationSettings() {
    const row = await this.ensureConfiguration();
    return this.toPublicSettings(row);
  }

  async updateOrganizationSettings(
    dto: UpdateOrganizationSettingsDto,
    actor: AuthenticatedUser,
  ) {
    const current =
      await this.ensureConfiguration();
    if (dto.timezone !== undefined) {
      this.assertTimeZone(dto.timezone);
    }
    if (
      dto.logoFileId !== undefined &&
      dto.logoFileId !== null
    ) {
      await this.files.requireOrganizationLogo(
        dto.logoFileId,
      );
    }

    const patch: Record<string, unknown> = {
      updated_by_profile: actor.profileId,
      date_updated: this.knex.fn.now(),
    };
    if (dto.organizationName !== undefined) {
      patch.organization_name =
        dto.organizationName.trim();
    }
    if (dto.logoFileId !== undefined) {
      patch.logo_file_id =
        dto.logoFileId ?? null;
    }
    if (dto.primaryColor !== undefined) {
      patch.primary_color = dto.primaryColor;
    }
    if (dto.locale !== undefined) {
      patch.locale = dto.locale;
    }
    if (dto.timezone !== undefined) {
      patch.timezone = dto.timezone;
    }
    if (dto.dateFormat !== undefined) {
      patch.date_format = dto.dateFormat;
    }
    if (dto.defaultCurrency !== undefined) {
      patch.default_currency =
        dto.defaultCurrency.toUpperCase();
    }

    const [updated] = await this.knex(
      'tenant_configuration',
    )
      .where('id_configuration', 1)
      .update(patch)
      .returning('*');

    await this.audit.record({
      actorProfileId: actor.profileId,
      action: 'tenant_configuration.updated',
      targetType: 'tenant_configuration',
      targetId: '1',
      before: this.auditValue(current),
      after: this.auditValue(updated),
    });

    if (
      current.logo_file_id &&
      current.logo_file_id !==
        updated.logo_file_id
    ) {
      await this.files.remove(
        current.logo_file_id,
        actor,
      );
    }

    return this.toPublicSettings(updated);
  }

  async getPublicBranding() {
    const row = await this.ensureConfiguration();
    return {
      organizationName:
        await this.organizationName(row),
      primaryColor: row.primary_color,
      locale: row.locale,
      timezone: row.timezone,
      dateFormat: row.date_format,
      defaultCurrency: row.default_currency,
      logoUrl: this.logoUrl(row),
    };
  }

  async getPublicLogoUrl(): Promise<string> {
    const row = await this.ensureConfiguration();
    if (!row.logo_file_id) {
      throw new BadRequestException(
        'Tenantul nu are un logo configurat.',
      );
    }
    return this.files.organizationLogoDownloadUrl(
      row.logo_file_id,
    );
  }

  private async ensureConfiguration() {
    let row = await this.knex(
      'tenant_configuration',
    )
      .where('id_configuration', 1)
      .first();
    if (row) return row;
    [row] = await this.knex(
      'tenant_configuration',
    )
      .insert({ id_configuration: 1 })
      .returning('*');
    return row;
  }

  private async toPublicSettings(row: any) {
    return {
      organizationName:
        await this.organizationName(row),
      logoFileId: row.logo_file_id,
      logoUrl: this.logoUrl(row),
      primaryColor: row.primary_color,
      locale: row.locale,
      timezone: row.timezone,
      dateFormat: row.date_format,
      defaultCurrency: row.default_currency,
      dateUpdated: row.date_updated,
    };
  }

  private async organizationName(
    row: any,
  ): Promise<string> {
    if (row.organization_name)
      return row.organization_name;
    const tenant = await this.metaDb
      .knex('tenants')
      .where('slug', this.tenantContext.slug)
      .select('company_name')
      .first();
    return (
      tenant?.company_name ||
      this.tenantContext.slug ||
      'Moduvis'
    );
  }

  private assertTimeZone(value: string) {
    try {
      new Intl.DateTimeFormat('ro-RO', {
        timeZone: value,
      }).format();
    } catch {
      throw new BadRequestException(
        'Fusul orar trebuie sa fie un identificator IANA valid.',
      );
    }
  }

  private auditValue(row: any) {
    return {
      organizationName: row.organization_name,
      logoFileId: row.logo_file_id,
      primaryColor: row.primary_color,
      locale: row.locale,
      timezone: row.timezone,
      dateFormat: row.date_format,
      defaultCurrency: row.default_currency,
    };
  }

  private logoUrl(row: any): string | null {
    if (!row.logo_file_id) return null;
    const version = new Date(
      row.date_updated,
    ).getTime();
    return `/api/v1/public/tenant-branding/logo?v=${Number.isFinite(version) ? version : 0}`;
  }
}
