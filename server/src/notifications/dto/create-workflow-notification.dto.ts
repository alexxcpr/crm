import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateWorkflowNotificationDto {
  @IsUUID()
  recipientProfileId: string;

  @IsString()
  @MaxLength(255)
  subject: string;

  @IsString()
  @MaxLength(10_000)
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  targetEntitySlug?: string;

  @ValidateIf((dto) => dto.targetEntitySlug !== undefined || dto.targetRecordId !== undefined)
  @IsUUID()
  targetRecordId?: string;

  @IsString()
  @MaxLength(200)
  sourceExecutionId: string;

  @IsString()
  @MaxLength(200)
  sourceNodeId: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sourceRunIndex: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sourceItemIndex: number;
}
