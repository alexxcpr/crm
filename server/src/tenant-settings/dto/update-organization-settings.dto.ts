import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

export const TENANT_PRIMARY_COLORS = [
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
] as const;

export const TENANT_LOCALES = [
  'ro-RO',
  'en-GB',
  'en-US',
] as const;

export const TENANT_DATE_FORMATS = [
  'dd.MM.yyyy',
  'dd/MM/yyyy',
  'MM/dd/yyyy',
  'yyyy-MM-dd',
] as const;

export const TENANT_CURRENCIES = [
  'RON',
  'EUR',
  'USD',
  'GBP',
] as const;

export class UpdateOrganizationSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  organizationName?: string;

  @IsOptional()
  @IsUUID()
  logoFileId?: string | null;

  @IsOptional()
  @IsIn(TENANT_PRIMARY_COLORS)
  primaryColor?: string;

  @IsOptional()
  @IsIn(TENANT_LOCALES)
  locale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @IsOptional()
  @IsIn(TENANT_DATE_FORMATS)
  dateFormat?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  @IsIn(TENANT_CURRENCIES)
  defaultCurrency?: string;
}
