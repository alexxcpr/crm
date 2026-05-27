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
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TenantConnectionManager } from 'src/tenant/tenant-connection.manager';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { BillingApiClient } from 'src/tenant/billing-api.client';
import { DynamicDataService } from 'src/dynamic-data/dynamic-data.service';
import * as crypto from 'crypto';

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
  ) {
    this.verifyDataAccess(secret);

    const result = await this.handleDataOperation(tenantSlug, () =>
      this.dataService.findOne(entitySlug, id),
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
  ) {
    this.verifyDataAccess(secret);

    const result = await this.handleDataOperation(tenantSlug, () =>
      this.dataService.create(entitySlug, body),
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
  ) {
    this.verifyDataAccess(secret);

    const result = await this.handleDataOperation(tenantSlug, () =>
      this.dataService.update(entitySlug, id, body),
    );

    this.logger.log(
      `Webhook data PUT: ${tenantSlug}/${entitySlug}/${id}`,
    );

    return result;
  }

  // ─── Data CRUD routes (query params — used by n8n when entity/id are dynamic expressions) ───

  @Get(':tenantSlug/data-resolve')
  async getDataResolve(
    @Param('tenantSlug') tenantSlug: string,
    @Query('entity') entitySlug: string,
    @Query('id') id: string,
    @Headers('x-webhook-secret') secret?: string,
  ) {
    this.verifyDataAccess(secret);

    if (!entitySlug) {
      throw new NotFoundException('Query param "entity" is required');
    }

    const result = await this.handleDataOperation(tenantSlug, () =>
      this.dataService.findOne(entitySlug, id),
    );

    this.logger.log(
      `Webhook data GET (resolve): ${tenantSlug}/${entitySlug}/${id}`,
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
  ) {
    this.verifyDataAccess(secret);

    if (!entitySlug) {
      throw new NotFoundException('Query param "entity" is required');
    }

    const result = await this.handleDataOperation(tenantSlug, () =>
      this.dataService.create(entitySlug, body),
    );

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
  ) {
    this.verifyDataAccess(secret);

    if (!entitySlug) {
      throw new NotFoundException('Query param "entity" is required');
    }

    const result = await this.handleDataOperation(tenantSlug, () =>
      this.dataService.update(entitySlug, id, body),
    );

    this.logger.log(
      `Webhook data PUT (resolve): ${tenantSlug}/${entitySlug}/${id}`,
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

  /**
   * Wraps a data operation for n8n consumption: catches NestJS exceptions and
   * returns them as 200 OK with { success: false, ... } so n8n's HTTP Request
   * node doesn't treat validation errors as workflow failures.
   */
  private async handleDataOperation<T>(
    tenantSlug: string,
    callback: () => Promise<T>,
  ): Promise<T | { success: boolean; statusCode: number; error: string; message: any; timestamp: string }> {
    try {
      return await this.runInTenantContext(tenantSlug, callback);
    } catch (err) {
      if (err instanceof HttpException) {
        const statusCode = err.getStatus();
        const res = err.getResponse();
        let message: any = 'Internal error';
        let error = 'Error';
        if (typeof res === 'string') {
          message = res;
        } else if (typeof res === 'object' && res !== null) {
          const obj = res as Record<string, any>;
          message = obj.message ?? message;
          error = obj.error ?? error;
        }
        return {
          success: false,
          statusCode,
          error,
          message,
          timestamp: new Date().toISOString(),
        };
      }
      throw err;
    }
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
