export const BASE_INCLUDED_PROFILE_SEATS = 5;
export const BASE_INCLUDED_STORAGE_GB = 10;
export const STORAGE_UNIT_GB = 10;
export const STORAGE_UNIT_PRICE_EUR = 1.5;

export const BILLING_FEATURES = {
  reportsDashboards: {
    key: 'reports_dashboards',
    label: 'Rapoarte si dashboard-uri',
    description: 'Configurare rapoarte si dashboard-uri in UI.',
    unit: 'profile_seat',
  },
} as const;

export type BillingFeatureKey = typeof BILLING_FEATURES[keyof typeof BILLING_FEATURES]['key'];
