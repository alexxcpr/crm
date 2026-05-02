import {
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  IsObject,
  IsBoolean,
  IsInt,
  MaxLength,
} from 'class-validator';

export class UpdateActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsBoolean()
  show_in_ui?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  trigger_events?: string[];

  @IsOptional()
  @IsObject()
  trigger_conditions?: Record<string, any>;

  @IsOptional()
  @IsUUID()
  id_workflow?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsInt()
  rank?: number;
}
