import { Module } from '@nestjs/common';
import { N8nApiClient } from './n8n-api.client';
import { WorkflowSyncService } from './workflow-sync.service';
import { N8nWebhookController } from './n8n-webhook.controller';

@Module({
  controllers: [N8nWebhookController],
  providers: [N8nApiClient, WorkflowSyncService],
  exports: [N8nApiClient, WorkflowSyncService],
})
export class N8nModule {}
