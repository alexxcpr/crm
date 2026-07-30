import { Module } from '@nestjs/common';
import { DocumentsModule } from 'src/documents/documents.module';
import { DynamicDataModule } from 'src/dynamic-data/dynamic-data.module';
import { IntegrationsModule } from 'src/integrations/integrations.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { WorkflowHttpDomainController } from './http-domain.controller';
import { WorkflowHttpDomainService } from './http-domain.service';
import { NodeRegistryController } from './node-registry.controller';
import { NodeRegistryService } from './node-registry.service';
import { WorkflowCallContextService } from './workflow-call-context.service';
import { WorkflowCompilerService } from './workflow-compiler.service';
import { WorkflowHistoryController } from './workflow-history.controller';
import { WorkflowHistoryService } from './workflow-history.service';
import { WorkflowHttpClientService } from './workflow-http-client.service';
import { WorkflowMaintenanceService } from './workflow-maintenance.service';
import { WorkflowNodeExecutorService } from './workflow-node-executor.service';
import { WorkflowRuntimeService } from './workflow-runtime.service';
import { WorkflowSnapshotService } from './workflow-snapshot.service';

@Module({
  imports: [
    DynamicDataModule,
    IntegrationsModule,
    NotificationsModule,
    DocumentsModule,
  ],
  controllers: [
    NodeRegistryController,
    WorkflowHttpDomainController,
    WorkflowHistoryController,
  ],
  providers: [
    NodeRegistryService,
    WorkflowHttpDomainService,
    WorkflowHttpClientService,
    WorkflowCompilerService,
    WorkflowSnapshotService,
    WorkflowHistoryService,
    WorkflowCallContextService,
    WorkflowNodeExecutorService,
    WorkflowRuntimeService,
    WorkflowMaintenanceService,
  ],
  exports: [
    NodeRegistryService,
    WorkflowCompilerService,
    WorkflowRuntimeService,
    WorkflowCallContextService,
    WorkflowHistoryService,
  ],
})
export class WorkflowEngineModule {}
