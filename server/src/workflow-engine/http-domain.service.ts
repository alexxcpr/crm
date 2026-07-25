import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantContext } from 'src/tenant/tenant-context.service';
import {
  CreateWorkflowHttpDomainDto,
  UpdateWorkflowHttpDomainDto,
} from './dto/http-domain.dto';

@Injectable()
export class WorkflowHttpDomainService {
  constructor(
    private readonly tenantContext: TenantContext,
  ) {}

  private get knex() {
    return this.tenantContext.knex;
  }

  async list() {
    return this.knex(
      'workflow_http_allowed_domain',
    )
      .select('*')
      .orderBy('name', 'asc');
  }

  async create(
    dto: CreateWorkflowHttpDomainDto,
    profileId: string | null,
  ) {
    const hostname = this.normalizeHostname(
      dto.hostname,
    );
    await this.assertUnique(
      hostname,
      dto.port ?? null,
    );
    const [row] = await this.knex(
      'workflow_http_allowed_domain',
    )
      .insert({
        name: dto.name.trim(),
        hostname,
        port: dto.port ?? null,
        is_active: dto.isActive ?? true,
        id_created_by_profile: profileId,
      })
      .returning('*');
    return row;
  }

  async update(
    id: string,
    dto: UpdateWorkflowHttpDomainDto,
  ) {
    const current = await this.knex(
      'workflow_http_allowed_domain',
    )
      .where('id_domain', id)
      .first();
    if (!current) {
      throw new NotFoundException(
        'Domeniul HTTP aprobat nu a fost gasit.',
      );
    }

    const hostname =
      dto.hostname === undefined
        ? current.hostname
        : this.normalizeHostname(dto.hostname);
    const port =
      dto.port === undefined
        ? current.port
        : dto.port;
    if (
      hostname !== current.hostname ||
      port !== current.port
    ) {
      await this.assertUnique(
        hostname,
        port ?? null,
        id,
      );
    }
    const [row] = await this.knex(
      'workflow_http_allowed_domain',
    )
      .where('id_domain', id)
      .update({
        name: dto.name?.trim() ?? current.name,
        hostname,
        port: port ?? null,
        is_active:
          dto.isActive ?? current.is_active,
        date_updated: new Date(),
      })
      .returning('*');
    return row;
  }

  async remove(id: string) {
    const deleted = await this.knex(
      'workflow_http_allowed_domain',
    )
      .where('id_domain', id)
      .del();
    if (!deleted) {
      throw new NotFoundException(
        'Domeniul HTTP aprobat nu a fost gasit.',
      );
    }
  }

  async findAllowed(url: URL) {
    const port = this.effectivePort(url);
    const usesDefaultPort = !url.port;
    return this.knex(
      'workflow_http_allowed_domain',
    )
      .where({
        hostname: url.hostname.toLowerCase(),
        is_active: true,
      })
      .andWhere((builder) =>
        usesDefaultPort
          ? builder
              .whereNull('port')
              .orWhere('port', port)
          : builder.where('port', port),
      )
      .first();
  }

  async assertAllowed(url: URL) {
    const allowed = await this.findAllowed(url);
    if (!allowed) {
      throw new BadRequestException(
        `Domeniul "${url.hostname}" nu este aprobat pentru workflow-uri.`,
      );
    }
    return allowed;
  }

  private normalizeHostname(
    value: string,
  ): string {
    const hostname = value
      .trim()
      .toLowerCase()
      .replace(/\.$/, '');
    if (
      !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
        hostname,
      )
    ) {
      throw new BadRequestException(
        'Hostname-ul nu este valid.',
      );
    }
    return hostname;
  }

  private effectivePort(url: URL): number {
    if (url.port) return Number(url.port);
    return url.protocol === 'https:' ? 443 : 80;
  }

  private async assertUnique(
    hostname: string,
    port: number | null,
    excludeId?: string,
  ) {
    const query = this.knex(
      'workflow_http_allowed_domain',
    ).where({
      hostname,
    });
    if (port === null) query.whereNull('port');
    else query.andWhere('port', port);
    if (excludeId)
      query.whereNot('id_domain', excludeId);
    if (await query.first()) {
      throw new ConflictException(
        'Hostname-ul si portul sunt deja aprobate.',
      );
    }
  }
}
