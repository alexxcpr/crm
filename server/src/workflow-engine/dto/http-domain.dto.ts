import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateWorkflowHttpDomainDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(253)
  hostname: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateWorkflowHttpDomainDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(253)
  hostname?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
