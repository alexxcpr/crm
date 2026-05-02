import { IsString, IsOptional, IsArray, MaxLength } from 'class-validator';

export class CreateWorkflowDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsString()
  @MaxLength(100)
  slug: string;

  @IsOptional()
  @IsArray()
  nodes?: any[];

  @IsOptional()
  @IsArray()
  connections?: any[];
}
