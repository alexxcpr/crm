import {
  Controller,
  Post,
  Get,
  Put,
  Param,
  Query,
  Body,
  Headers,
  Logger,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TenantConnectionManager } from 'src/tenant/tenant-connection.manager';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { BillingApiClient } from 'src/tenant/billing-api.client';
import { DynamicDataService } from 'src/dynamic-data/dynamic-data.service';
import * as crypto from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { AuthenticatedUser } from 'src/security/security.types';

interface WebhookPayload {
  executionId: string;
  workflowId: string;
  status: 'success' | 'error';
  data?: Record<string, any>;
  error?: string;
  action?: string;
  entitySlug?: string;
  recordId?: string;
}

@Controller('v1/webhooks/n8n')
export class N8nWebhookController {
  private readonly logger = new Logger(N8nWebhookController.name);
  private readonly webhookSecret: string;

  constructor(
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly connectionManager: TenantConnectionManager,
    private readonly dataService: DynamicDataService,
    private readonly tenantContext: TenantContext,
    private readonly billingClient: BillingApiClient,
    private readonly jwt: JwtService,
  ) {
    this.webhookSecret = config.get<string>('N8N_WEBHOOK_SECRET', '');
  }

  // ─── Existing webhook routes ───

  @Post(':tenantSlug')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Param('tenantSlug') tenantSlug: string,
    @Body() payload: WebhookPayload,
    @Headers('x-webhook-signature') signature?: string,
  ) {
    if (this.webhookSecret) {
      this.verifySignature(payload, signature);
    }

    this.logger.log(
      `Webhook received: tenant=${tenantSlug} execution=${payload.executionId} status=${payload.status}`,
    );

    await this.eventEmitter.emitAsync('n8n.webhook.received', {
      tenantSlug,
      ...payload,
    });

    if (payload.status === 'error') {
      this.logger.warn(
        `Workflow execution failed: ${payload.executionId} — ${payload.error}`,
      );

      await this.eventEmitter.emitAsync('n8n.execution.failed', {
        tenantSlug,
        executionId: payload.executionId,
        workflowId: payload.workflowId,
        error: payload.error,
      });
    }

    if (payload.status === 'success') {
      await this.eventEmitter.emitAsync('n8n.execution.completed', {
        tenantSlug,
        executionId: payload.executionId,
        workflowId: payload.workflowId,
        data: payload.data,
      });
    }

    return { received: true };
  }

  @Post(':tenantSlug/record-update')
  @HttpCode(HttpStatus.OK)
  async handleRecordUpdate(
    @Param('tenantSlug') tenantSlug: string,
    @Body()
    body: {
      entity: string;
      recordId: string;
      fields: Record<string, any>;
      dbName: string;
    },
    @Headers('x-webhook-signature') signature?: string,
  ) {
    if (this.webhookSecret) {
      this.verifySignature(body, signature);
    }

    const knex = this.connectionManager.getConnection(body.dbName);

    const entity = await knex('entity').where('slug', body.entity).first();
    if (!entity) {
      this.logger.warn(
        `Webhook record-update: entity "${body.entity}" not found in tenant "${tenantSlug}"`,
      );
      return { updated: false, reason: 'entity_not_found' };
    }

    await knex(entity.table_name)
      .where('id', body.recordId)
      .update({
        ...body.fields,
        date_updated: new Date(),
      });

    this.logger.log(
      `Webhook record-update: ${body.entity}#${body.recordId} updated by n8n workflow`,
    );

    return { updated: true };
  }

  // ─── Data CRUD routes for n8n workflow nodes (path params — used when entity/id are hardcoded) ───

  @Get(':tenantSlug/data/:entitySlug/:id')
  async getData(
    @Param('tenantSlug') tenantSlug: string,
    @Param('entitySlug') entitySlug: string,
    @Param('id') id: string,
    @Headers('x-webhook-secret') secret?: string,
    @Headers('x-workflow-token') workflowToken?: string,
  ) {
    this.verifyDataAccess(secret);

    const result = await this.handleDataOperation(tenantSlug, workflowToken, (actor) =>
      this.dataService.findOne(entitySlug, id, actor),
    );

    this.logger.log(
      `Webhook data GET: ${tenantSlug}/${entitySlug}/${id}`,
    );

    return result;
  }

  @Post(':tenantSlug/data/:entitySlug')
  @HttpCode(HttpStatus.OK)
  async createData(
    @Param('tenantSlug') tenantSlug: string,
    @Param('entitySlug') entitySlug: string,
    @Body() body: Record<string, any>,
    @Headers('x-webhook-secret') secret?: string,
    @Headers('x-workflow-token') workflowToken?: string,
  ) {
    this.verifyDataAccess(secret);

    const result = await this.handleDataOperation(tenantSlug, workflowToken, (actor) =>
      this.dataService.create(entitySlug, body, actor),
    );

    this.logger.log(
      `Webhook data POST: ${tenantSlug}/${entitySlug}`,
    );

    return result;
  }

  @Put(':tenantSlug/data/:entitySlug/:id')
  @HttpCode(HttpStatus.OK)
  async updateData(
    @Param('tenantSlug') tenantSlug: string,
    @Param('entitySlug') entitySlug: string,
    @Param('id') id: string,
    @Body() body: Record<string, any>,
    @Headers('x-webhook-secret') secret?: string,
    @Headers('x-workflow-token') workflowToken?: string,
  ) {
    this.verifyDataAccess(secret);

    const result = await this.handleDataOperation(tenantSlug, workflowToken, (actor) =>
      this.dataService.update(entitySlug, id, body, actor),
    );

    this.logger.log(
      `Webhook data PUT: ${tenantSlug}/${entitySlug}/${id}`,
    );

    return result;
  }

  // ─── Data list route (used by app_get_record node with optional filters + limit) ───

  @Get(':tenantSlug/data-list')
  async getDataList(
    @Param('tenantSlug') tenantSlug: string,
    @Query() query: Record<string, any>,
    @Headers('x-webhook-secret') secret?: string,
    @Headers('x-workflow-token') workflowToken?: string,
  ) {
    this.verifyDataAccess(secret);

    const result = await this.handleDataOperation(tenantSlug, workflowToken, async (actor) => {
      if (!query.entity) throw new BadRequestException('Query param "entity" is required');
      const list = await this.dataService.findAll(query.entity, query, actor, {
        tableOnly: false,
      });
      // When limit=1, unwrap the array so downstream $json.data.field works the same
      // as the old data-resolve endpoint did for single-record fetches.
      if (query.limit === '1' || query.limit === 1) {
        const first = list.data?.[0] ?? null;
        return { data: first };
      }
      return list;
    });

    this.logger.log(
      `Webhook data LIST: ${tenantSlug}/${query.entity} filters=${JSON.stringify(query.filter ?? {})} limit=${query.limit ?? 'none'} returned=${Array.isArray((result as any)?.data) ? (result as any).data.length : ((result as any)?.data ? 1 : 0)} total=${(result as any)?.meta?.total ?? 'n/a'}`,
    );

    return result;
  }

  // ─── Data CRUD routes (query params — used by n8n when entity/id are dynamic expressions) ───

  @Get(':tenantSlug/data-resolve')
  async getDataResolve(
    @Param('tenantSlug') tenantSlug: string,
    @Query('entity') entitySlug: string,
    @Query('id') id: string,
    @Query('filterField') filterField?: string,
    @Query('filterValue') filterValue?: string,
    @Headers('x-webhook-secret') secret?: string,
    @Headers('x-workflow-token') workflowToken?: string,
  ) {
    this.verifyDataAccess(secret);

    const result = await this.handleDataOperation(tenantSlug, workflowToken, async (actor) => {
      if (!entitySlug) throw new BadRequestException('Query param "entity" is required');

      if (filterField && filterValue !== undefined && filterValue !== null && filterValue !== '') {
        const query: Record<string, any> = {
          limit: 1,
          filter: {
            [filterField]: { eq: filterValue },
          },
        };
        const list = await this.dataService.findAll(entitySlug, query, actor, {
          tableOnly: false,
        });
        const first = list.data?.[0] ?? null;
        if (!first) {
          throw new NotFoundException(`Nicio inregistrare gasita in "${entitySlug}" cu ${filterField} = "${filterValue}".`);
        }
        return { data: first };
      }

      if (!id) throw new BadRequestException('Query param "id" or filter params are required');
      return this.dataService.findOne(entitySlug, id, actor);
    });

    this.logger.log(
      `Webhook data GET (resolve): ${tenantSlug}/${entitySlug}/${id ?? `${filterField}=${filterValue}`}`,
    );

    return result;
  }

  @Post(':tenantSlug/data-resolve')
  @HttpCode(HttpStatus.OK)
  async createDataResolve(
    @Param('tenantSlug') tenantSlug: string,
    @Query('entity') entitySlug: string,
    @Body() body: Record<string, any>,
    @Headers('x-webhook-secret') secret?: string,
    @Headers('x-workflow-token') workflowToken?: string,
  ) {
    this.verifyDataAccess(secret);

    const result = await this.handleDataOperation(tenantSlug, workflowToken, (actor) => {
      if (!entitySlug) throw new BadRequestException('Query param "entity" is required');
      return this.dataService.create(entitySlug, body, actor);
    });

    this.logger.log(
      `Webhook data POST (resolve): ${tenantSlug}/${entitySlug}`,
    );

    return result;
  }

  @Put(':tenantSlug/data-resolve')
  @HttpCode(HttpStatus.OK)
  async updateDataResolve(
    @Param('tenantSlug') tenantSlug: string,
    @Query('entity') entitySlug: string,
    @Query('id') id: string,
    @Body() body: Record<string, any>,
    @Headers('x-webhook-secret') secret?: string,
    @Headers('x-workflow-token') workflowToken?: string,
  ) {
    this.verifyDataAccess(secret);

    const result = await this.handleDataOperation(tenantSlug, workflowToken, (actor) => {
      if (!entitySlug) throw new BadRequestException('Query param "entity" is required');
      if (!id) throw new BadRequestException('Query param "id" is required');
      return this.dataService.update(entitySlug, id, body, actor);
    });

    this.logger.log(
      `Webhook data PUT (resolve): ${tenantSlug}/${entitySlug}/${id} fields=${Object.keys(body ?? {}).join(',') || 'none'}`,
    );

    return result;
  }

  // ─── Auth helpers ───

  private verifyDataAccess(secret?: string): void {
    if (!this.webhookSecret) return;

    if (!secret) {
      throw new UnauthorizedException('Missing webhook secret header');
    }

    if (
      secret.length !== this.webhookSecret.length ||
      !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(this.webhookSecret))
    ) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
  }

  private verifySignature(payload: any, signature?: string): void {
    if (!signature) {
      throw new UnauthorizedException('Missing webhook signature');
    }

    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  private async handleDataOperation<T>(
    tenantSlug: string,
    workflowToken: string | undefined,
    callback: (actor: AuthenticatedUser) => Promise<T>,
  ): Promise<T> {
    if (!workflowToken) throw new UnauthorizedException('Missing workflow token');
    return await this.runInTenantContext(tenantSlug, async () => {
      let payload: any;
      try {
        payload = await this.jwt.verifyAsync(workflowToken);
      } catch {
        throw new UnauthorizedException('Workflow token invalid sau expirat');
      }
      if (payload.purpose !== 'workflow' || payload.tenant !== tenantSlug) throw new UnauthorizedException('Workflow token invalid');
      const knex = this.tenantContext.knex;
      const user = await knex('user').where({ id: payload.sub, is_active: true }).first();
      const profile = await knex('profile').where({ id_profile: payload.profileId, id_user: payload.sub, is_active: true }).first();
      if (!user || !profile) throw new UnauthorizedException('Profilul workflow nu mai este activ');
      const roles = await knex('profile_role').join('role', 'profile_role.id_role', 'role.id_role')
        .where('profile_role.id_profile', profile.id_profile).select('role.slug');
      const { hash: _, ...safeUser } = user;
      return callback({ ...safeUser, profile, profileId: profile.id_profile, roles: roles.map((row) => row.slug), tenant: tenantSlug, dbName: this.tenantContext.dbName });
    });
  }

  private async runInTenantContext<T>(
    tenantSlug: string,
    callback: () => Promise<T>,
  ): Promise<T> {
    const tenantInfo = await this.billingClient.getCompanyBySlug(tenantSlug);
    if (!tenantInfo || !tenantInfo.isActive) {
      throw new NotFoundException(`Tenant "${tenantSlug}" not found or inactive`);
    }

    const knex = this.connectionManager.getConnection({
      dbName: tenantInfo.dbName,
      dbUser: tenantInfo.dbUser ?? undefined,
      dbPassword: tenantInfo.dbPassword ?? undefined,
    });

    return this.tenantContext.run(
      { knex, slug: tenantSlug, dbName: tenantInfo.dbName },
      callback,
    );
  }
}
