import {
  Controller,
  Post,
  Param,
  Body,
  Headers,
  Logger,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TenantConnectionManager } from 'src/tenant/tenant-connection.manager';
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
  ) {
    this.webhookSecret = config.get<string>('N8N_WEBHOOK_SECRET', '');
  }

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
}
