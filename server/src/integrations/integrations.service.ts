import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { IntegrationCryptoService } from './integration-crypto.service';
import { CreateSmtpIntegrationDto, UpdateSmtpIntegrationDto } from './dto/integration.dto';

export interface StoredSmtpConfig {
  host: string;
  port: number;
  security: 'none' | 'starttls' | 'tls';
  username: string | null;
  fromName: string | null;
  fromEmail: string;
  rejectUnauthorized: boolean;
}

interface IntegrationRow {
  id_integration: string;
  type: string;
  name: string;
  config: StoredSmtpConfig | string;
  secret_encrypted: string | null;
  is_active: boolean;
  id_replaced_by: string | null;
  date_deleted: Date | null;
  date_created: Date;
  date_updated: Date;
}

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly crypto: IntegrationCryptoService,
    private readonly events: EventEmitter2,
  ) {}

  private get knex() {
    return this.tenantContext.knex;
  }

  async list(type = 'smtp') {
    if (type !== 'smtp') throw new BadRequestException(`Tipul de integrare "${type}" nu este disponibil.`);
    const rows = await this.knex<IntegrationRow>('integration_definition')
      .where({ type })
      .whereNull('date_deleted')
      .orderBy('name', 'asc');
    const usages = await this.usageCounts();
    return { data: rows.map((row) => this.publicRow(row, usages.get(row.id_integration) ?? 0)) };
  }

  async createSmtp(dto: CreateSmtpIntegrationDto) {
    const username = this.optional(dto.username);
    const password = this.optional(dto.password);
    this.assertAuthentication(username, password, false);
    const config = this.configFromDto(dto, username);
    this.assertTransportConfiguration(config);

    const [row] = await this.knex<IntegrationRow>('integration_definition')
      .insert({
        type: 'smtp',
        name: dto.name.trim(),
        config,
        secret_encrypted: password ? this.crypto.encrypt(password) : null,
        is_active: dto.isActive ?? true,
      })
      .returning('*');
    return { data: this.publicRow(row, 0) };
  }

  async update(id: string, dto: UpdateSmtpIntegrationDto) {
    const current = await this.findRow(id, false);
    const currentConfig = this.parseConfig(current.config);
    const username = dto.username === undefined ? currentConfig.username : this.optional(dto.username);
    const suppliedPassword = this.optional(dto.password);
    const clearPassword = dto.clearPassword === true;
    const hasPassword = clearPassword ? false : !!suppliedPassword || !!current.secret_encrypted;

    this.assertAuthentication(username, suppliedPassword, hasPassword);

    const config: StoredSmtpConfig = {
      host: dto.host?.trim() ?? currentConfig.host,
      port: dto.port ?? currentConfig.port,
      security: dto.security ?? currentConfig.security,
      username,
      fromName: dto.fromName === undefined ? currentConfig.fromName : this.optional(dto.fromName),
      fromEmail: dto.fromEmail?.trim().toLowerCase() ?? currentConfig.fromEmail,
      rejectUnauthorized: dto.rejectUnauthorized ?? currentConfig.rejectUnauthorized,
    };
    this.assertTransportConfiguration(config);

    const patch: Record<string, unknown> = {
      name: dto.name?.trim() ?? current.name,
      config,
      is_active: dto.isActive ?? current.is_active,
      date_updated: new Date(),
    };
    if (clearPassword) patch.secret_encrypted = null;
    else if (suppliedPassword) patch.secret_encrypted = this.crypto.encrypt(suppliedPassword);

    const [row] = await this.knex<IntegrationRow>('integration_definition')
      .where('id_integration', id)
      .update(patch)
      .returning('*');
    const usage = (await this.usageCounts()).get(id) ?? 0;
    return { data: this.publicRow(row, usage) };
  }

  async remove(id: string, replacementIntegrationId?: string) {
    const current = await this.findRow(id, false);
    const affected = await this.workflowsUsing(id);
    let replacement: IntegrationRow | null = null;

    if (affected.length > 0) {
      if (!replacementIntegrationId) {
        throw new ConflictException('Integrarea este folosita de workflow-uri. Alege o integrare SMTP inlocuitoare.');
      }
      if (replacementIntegrationId === id) throw new BadRequestException('Integrarea nu se poate inlocui cu ea insasi.');
      replacement = await this.findRow(replacementIntegrationId, false);
      if (replacement.type !== current.type || !replacement.is_active) {
        throw new BadRequestException('Integrarea inlocuitoare trebuie sa fie un cont SMTP activ.');
      }

      await this.knex.transaction(async (trx) => {
        for (const workflow of affected) {
          const nodes = this.parseNodes(workflow.nodes).map((node) => {
            if (node.type !== 'email' || node.parameters?.integrationId !== id) return node;
            return {
              ...node,
              parameters: {
                ...node.parameters,
                integrationId: replacement!.id_integration,
                integrationName: replacement!.name,
              },
            };
          });
          await trx('workflow_definition').where('id_workflow', workflow.id_workflow).update({
            nodes: JSON.stringify(nodes),
            version: Number(workflow.version ?? 1) + 1,
            date_updated: new Date(),
          });
        }
        await trx('integration_definition').where('id_integration', id).update({
          is_active: false,
          id_replaced_by: replacement!.id_integration,
          date_deleted: new Date(),
          date_updated: new Date(),
        });
      });
    } else {
      await this.knex('integration_definition').where('id_integration', id).update({
        is_active: false,
        date_deleted: new Date(),
        date_updated: new Date(),
      });
    }

    if (affected.length > 0) {
      await this.events.emitAsync('integration.replaced', {
        integrationId: id,
        replacementIntegrationId: replacement!.id_integration,
        workflowIds: affected.map((workflow) => workflow.id_workflow),
      });
    }

    return { message: affected.length ? `${affected.length} workflow-uri au fost mutate pe integrarea noua.` : 'Integrarea a fost stearsa.' };
  }

  async findSmtpForSending(id: string): Promise<{ row: IntegrationRow; config: StoredSmtpConfig; password: string | null }> {
    let row = await this.findRow(id, true);
    const visited = new Set<string>();
    while (row.date_deleted && row.id_replaced_by) {
      if (visited.has(row.id_integration)) throw new BadRequestException('Redirect circular intre integrari.');
      visited.add(row.id_integration);
      row = await this.findRow(row.id_replaced_by, true);
    }
    if (row.date_deleted || !row.is_active) throw new BadRequestException(`Integrarea SMTP "${row.name}" este inactiva.`);
    return {
      row,
      config: this.parseConfig(row.config),
      password: row.secret_encrypted ? this.crypto.decrypt(row.secret_encrypted) : null,
    };
  }

  private async findRow(id: string, includeDeleted: boolean): Promise<IntegrationRow> {
    const query = this.knex<IntegrationRow>('integration_definition').where('id_integration', id);
    if (!includeDeleted) query.whereNull('date_deleted');
    const row = await query.first();
    if (!row) throw new NotFoundException('Integrarea nu a fost gasita.');
    if (row.type !== 'smtp') throw new BadRequestException('Integrarea selectata nu este SMTP.');
    return row;
  }

  private configFromDto(dto: CreateSmtpIntegrationDto, username: string | null): StoredSmtpConfig {
    return {
      host: dto.host.trim(),
      port: dto.port,
      security: dto.security,
      username,
      fromName: this.optional(dto.fromName),
      fromEmail: dto.fromEmail.trim().toLowerCase(),
      rejectUnauthorized: dto.rejectUnauthorized,
    };
  }

  private publicRow(row: IntegrationRow, usageCount: number) {
    const config = this.parseConfig(row.config);
    return {
      id_integration: row.id_integration,
      type: row.type,
      name: row.name,
      ...config,
      hasPassword: !!row.secret_encrypted,
      is_active: row.is_active,
      usageCount,
      date_created: row.date_created,
      date_updated: row.date_updated,
    };
  }

  private parseConfig(value: StoredSmtpConfig | string): StoredSmtpConfig {
    return typeof value === 'string' ? JSON.parse(value) : value;
  }

  private optional(value?: string | null): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private assertAuthentication(username: string | null, password: string | null, hasPassword: boolean) {
    if (!!username !== (!!password || hasPassword)) {
      throw new BadRequestException('Username-ul si parola SMTP trebuie completate impreuna sau lasate ambele goale.');
    }
  }

  private assertTransportConfiguration(config: StoredSmtpConfig) {
    if (config.port === 465 && config.security !== 'tls') {
      throw new BadRequestException('Portul 465 necesita securitate TLS / SSL direct.');
    }

    if (config.host.trim().toLowerCase() === 'smtp.gmail.com') {
      const validGmailPair = (config.port === 465 && config.security === 'tls')
        || (config.port === 587 && config.security === 'starttls');
      if (!validGmailPair) {
        throw new BadRequestException('Pentru smtp.gmail.com foloseste portul 465 cu TLS / SSL direct sau portul 587 cu STARTTLS.');
      }
    }
  }

  private async workflowsUsing(integrationId: string): Promise<any[]> {
    const workflows = await this.knex('workflow_definition').select('id_workflow', 'name', 'nodes', 'version');
    return workflows.filter((workflow) => this.parseNodes(workflow.nodes).some(
      (node) => node.type === 'email' && node.parameters?.integrationId === integrationId,
    ));
  }

  private async usageCounts(): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    const workflows = await this.knex('workflow_definition').select('nodes');
    for (const workflow of workflows) {
      const ids = new Set<string>();
      for (const node of this.parseNodes(workflow.nodes)) {
        if (node.type === 'email' && node.parameters?.integrationId) ids.add(node.parameters.integrationId);
      }
      for (const id of ids) result.set(id, (result.get(id) ?? 0) + 1);
    }
    return result;
  }

  private parseNodes(value: unknown): any[] {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { return []; }
    }
    return [];
  }
}
