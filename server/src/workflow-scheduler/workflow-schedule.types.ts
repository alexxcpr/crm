import type { AuthenticatedUser } from 'src/security/security.types';

export interface WorkflowScheduleRow {
  id_schedule: string;
  id_workflow: string;
  name: string;
  schedule_type: 'cron' | 'once';
  cron_expression: string | null;
  run_at: Date | string | null;
  timezone: string;
  is_active: boolean;
  next_run_at: Date | string | null;
  lock_token: string | null;
  locked_until: Date | string | null;
  active_revision_id?: string | null;
  latest_revision_id?: string | null;
  [key: string]: any;
}

export interface WorkflowScheduleClaim {
  schedule: WorkflowScheduleRow;
  scheduledFor: Date;
  lockToken: string;
  actor: AuthenticatedUser;
}
