import { Module } from '@nestjs/common';
import { DynamicDataModule } from 'src/dynamic-data/dynamic-data.module';
import { N8nApiClient } from './n8n-api.client';
import { WorkflowSyncService } from './workflow-sync.service';
import { N8nWebhookController } from './n8n-webhook.controller';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [DynamicDataModule, NotificationsModule],
  controllers: [N8nWebhookController],
  providers: [N8nApiClient, WorkflowSyncService],
  exports: [N8nApiClient, WorkflowSyncService],
})
export class N8nModule {}
