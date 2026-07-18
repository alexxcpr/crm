import {
  BASE_INCLUDED_STORAGE_GB,
  STORAGE_UNIT_GB,
} from 'src/billing/billing.constants';
import { GB_IN_BYTES } from './storage.constants';
import type { StorageUsageState } from './storage.types';

export interface StorageQuotaSource {
  included_storage_gb?: number | string | null;
  extra_storage_units?: number | string | null;
}

export function calculateQuotaBytes(
  source: StorageQuotaSource,
): bigint {
  const includedGb = Number(
    source.included_storage_gb ??
      BASE_INCLUDED_STORAGE_GB,
  );
  const extraUnits = Number(
    source.extra_storage_units ?? 0,
  );
  return (
    BigInt(
      includedGb + extraUnits * STORAGE_UNIT_GB,
    ) * BigInt(GB_IN_BYTES)
  );
}

export function buildStorageUsageState(
  source: StorageQuotaSource,
  usage: {
    used_bytes?: number | string | bigint | null;
    reserved_bytes?:
      | number
      | string
      | bigint
      | null;
  } | null,
): StorageUsageState {
  const includedGb = Number(
    source.included_storage_gb ??
      BASE_INCLUDED_STORAGE_GB,
  );
  const extraUnits = Number(
    source.extra_storage_units ?? 0,
  );
  const quotaGb =
    includedGb + extraUnits * STORAGE_UNIT_GB;
  const quotaBytes = quotaGb * GB_IN_BYTES;
  const usedBytes = Number(
    usage?.used_bytes ?? 0,
  );
  const reservedBytes = Number(
    usage?.reserved_bytes ?? 0,
  );
  const consumed = usedBytes + reservedBytes;

  return {
    includedGb,
    extraUnits,
    quotaGb,
    quotaBytes,
    usedBytes,
    reservedBytes,
    remainingBytes: Math.max(
      0,
      quotaBytes - consumed,
    ),
    percentage:
      quotaBytes > 0
        ? Math.round(
            (consumed / quotaBytes) * 10_000,
          ) / 100
        : 0,
    overQuota: consumed > quotaBytes,
  };
}
