import { Module } from '@nestjs/common';
import { N8nModule } from 'src/n8n/n8n.module';
import { WorkflowService } from './workflow.service';
import { ActionService } from './action.service';
import { AdminWorkflowController } from './admin-workflow.controller';
import { AdminActionController } from './admin-action.controller';
import { ActionController } from './action.controller';

@Module({
  imports: [N8nModule],
  controllers: [
    AdminWorkflowController,
    AdminActionController,
    ActionController,
  ],
  providers: [WorkflowService, ActionService],
  exports: [WorkflowService, ActionService],
})
export class ActionsModule {}
