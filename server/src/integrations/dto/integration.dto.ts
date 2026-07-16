import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const SMTP_SECURITY_MODES = ['none', 'starttls', 'tls'] as const;
export type SmtpSecurityMode = typeof SMTP_SECURITY_MODES[number];

export class CreateSmtpIntegrationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  host: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  @IsIn(SMTP_SECURITY_MODES)
  security: SmtpSecurityMode;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fromName?: string;

  @IsEmail()
  @MaxLength(255)
  fromEmail: string;

  @IsBoolean()
  rejectUnauthorized: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSmtpIntegrationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsIn(SMTP_SECURITY_MODES)
  security?: SmtpSecurityMode;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  password?: string;

  @IsOptional()
  @IsBoolean()
  clearPassword?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fromName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  fromEmail?: string;

  @IsOptional()
  @IsBoolean()
  rejectUnauthorized?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class TestSmtpIntegrationDto {
  @IsEmail()
  @MaxLength(255)
  to: string;
}

export class DeleteIntegrationDto {
  @IsOptional()
  @IsUUID()
  replacementIntegrationId?: string;
}

export class WorkflowEmailDto {
  @IsUUID()
  integrationId: string;

  @IsString()
  @MaxLength(320)
  to: string;

  @IsString()
  @MaxLength(998)
  subject: string;

  @IsString()
  content: string;
}
