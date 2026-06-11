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

export class CreateActionDto {
  @IsUUID()
  id_entity: string;

  @IsString()
  @MaxLength(200)
  name: string;

  @IsString()
  @MaxLength(100)
  slug: string;

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

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
