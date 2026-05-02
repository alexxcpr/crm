import { IsString, IsOptional, IsArray, IsIn, MaxLength } from 'class-validator';

export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsArray()
  nodes?: any[];

  @IsOptional()
  @IsArray()
  connections?: any[];

  @IsOptional()
  @IsString()
  @IsIn(['draft', 'active', 'paused'])
  status?: string;
}
