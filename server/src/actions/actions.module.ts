import { Module } from '@nestjs/common';
import { WorkflowEngineModule } from 'src/workflow-engine/workflow-engine.module';
import { WorkflowService } from './workflow.service';
import { ActionService } from './action.service';
import { AdminWorkflowController } from './admin-workflow.controller';
import { AdminActionController } from './admin-action.controller';
import { ActionController } from './action.controller';

@Module({
  imports: [WorkflowEngineModule],
  controllers: [
    AdminWorkflowController,
    AdminActionController,
    ActionController,
  ],
  providers: [WorkflowService, ActionService],
  exports: [WorkflowService, ActionService],
})
export class ActionsModule {}
