import { IsEmail, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Length, Matches, Min, MinLength } from 'class-validator';

export class TenantAvailabilityQueryDto {
  @IsOptional()
  @IsString()
  slug?: string;
}

export class ProvisionTenantDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/)
  tenantSlug: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  companyName: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  adminName: string;

  @IsEmail()
  adminEmail: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  plan?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsers?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  profileSeats?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  includedStorageGb?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  extraStorageUnits?: number;

  @IsOptional()
  @IsObject()
  features?: Record<string, boolean>;

  @IsString()
  @IsNotEmpty()
  stripeCustomerId: string;

  @IsString()
  @IsNotEmpty()
  stripeSubscriptionId: string;

  @IsString()
  @IsNotEmpty()
  stripeCheckoutSessionId: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  subscriptionStatus?: string;
}

export class SetAdminCredentialsDto {
  @IsString()
  @IsNotEmpty()
  stripeCheckoutSessionId: string;

  @IsEmail()
  adminEmail: string;

  @IsString()
  @IsNotEmpty()
  @Length(3, 64)
  @Matches(/^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/)
  adminUsername: string;

  @IsString()
  @MinLength(8)
  password: string;
}

export class SyncBillingStatusDto {
  @IsString()
  @IsNotEmpty()
  subscriptionStatus: string;

  @IsOptional()
  @IsString()
  billingStatus?: string;

  @IsOptional()
  currentPeriodEnd?: string;
}
