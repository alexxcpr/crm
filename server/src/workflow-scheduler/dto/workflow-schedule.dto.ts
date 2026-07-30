import {
  IsBoolean,
  IsIn,
  IsISO8601,
  Matches,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateWorkflowScheduleDto {
  @IsString()
  @Matches(/\S/, {
    message:
      'Numele programarii este obligatoriu.',
  })
  @MaxLength(200)
  name: string;

  @IsUUID()
  workflowId: string;

  @IsString()
  @IsIn(['cron', 'once'])
  scheduleType: 'cron' | 'once';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  cronExpression?: string;

  @IsOptional()
  @IsISO8601()
  runAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateWorkflowScheduleDto {
  @IsOptional()
  @IsString()
  @Matches(/\S/, {
    message:
      'Numele programarii este obligatoriu.',
  })
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsUUID()
  workflowId?: string;

  @IsOptional()
  @IsString()
  @IsIn(['cron', 'once'])
  scheduleType?: 'cron' | 'once';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  cronExpression?: string;

  @IsOptional()
  @IsISO8601()
  runAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PreviewWorkflowScheduleDto {
  @IsString()
  @MaxLength(100)
  cronExpression: string;

  @IsString()
  @MaxLength(100)
  timezone: string;
}
