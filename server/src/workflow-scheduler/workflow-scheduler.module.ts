import { Module } from '@nestjs/common';
import { WorkflowEngineModule } from 'src/workflow-engine/workflow-engine.module';
import { SchedulerIdentityService } from './scheduler-identity.service';
import { WorkflowScheduleController } from './workflow-schedule.controller';
import { WorkflowScheduleExpressionService } from './workflow-schedule-expression.service';
import { WorkflowScheduleService } from './workflow-schedule.service';
import { WorkflowSchedulerWorker } from './workflow-scheduler.worker';

@Module({
  imports: [WorkflowEngineModule],
  controllers: [WorkflowScheduleController],
  providers: [
    WorkflowScheduleExpressionService,
    SchedulerIdentityService,
    WorkflowScheduleService,
    WorkflowSchedulerWorker,
  ],
  exports: [WorkflowScheduleService],
})
export class WorkflowSchedulerModule {}
