export const ACCESS_LEVELS = [
  'platform_owner',
  'tenant_admin',
  'user',
] as const;

export type AccessLevel =
  (typeof ACCESS_LEVELS)[number];

export const GLOBAL_CAPABILITIES = [
  'builder.manage',
  'tenant.manage',
  'access_levels.manage',
  'billing.manage',
  'data.manage_all',
] as const;

export type GlobalCapability =
  (typeof GLOBAL_CAPABILITIES)[number];

export const ACCESS_LEVEL_CAPABILITIES: Record<
  AccessLevel,
  readonly GlobalCapability[]
> = {
  platform_owner: GLOBAL_CAPABILITIES,
  tenant_admin: [
    'tenant.manage',
    'billing.manage',
    'data.manage_all',
  ],
  user: [],
};
