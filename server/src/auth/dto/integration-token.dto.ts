import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  INTEGRATION_SCOPES,
  type IntegrationScope,
} from '../integration-token.types';

export class CreateIntegrationTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsIn(INTEGRATION_SCOPES, { each: true })
  scopes: IntegrationScope[];

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class RotateIntegrationTokenDto {
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
