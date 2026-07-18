import { GB_IN_BYTES } from './storage.constants';
import {
  buildStorageUsageState,
  calculateQuotaBytes,
} from './storage-quota.utils';

describe('storage quota calculations', () => {
  it('foloseste 10 GB zecimali pentru tenantul de baza', () => {
    expect(calculateQuotaBytes({})).toBe(
      10n * BigInt(GB_IN_BYTES),
    );
  });

  it('adauga imediat cate 10 GB pentru fiecare unitate suplimentara', () => {
    expect(
      calculateQuotaBytes({
        included_storage_gb: 10,
        extra_storage_units: 2,
      }),
    ).toBe(30n * BigInt(GB_IN_BYTES));
  });

  it('include rezervarile in spatiul ramas si in procent', () => {
    expect(
      buildStorageUsageState(
        {
          included_storage_gb: 10,
          extra_storage_units: 1,
        },
        {
          used_bytes: 5_000_000_000n,
          reserved_bytes: 1_000_000_000n,
        },
      ),
    ).toEqual({
      includedGb: 10,
      extraUnits: 1,
      quotaGb: 20,
      quotaBytes: 20_000_000_000,
      usedBytes: 5_000_000_000,
      reservedBytes: 1_000_000_000,
      remainingBytes: 14_000_000_000,
      percentage: 30,
      overQuota: false,
    });
  });

  it('marcheaza over-quota fara a returna spatiu ramas negativ', () => {
    const state = buildStorageUsageState(
      {
        included_storage_gb: 10,
        extra_storage_units: 0,
      },
      {
        used_bytes: '11000000000',
        reserved_bytes: '0',
      },
    );

    expect(state.overQuota).toBe(true);
    expect(state.remainingBytes).toBe(0);
    expect(state.percentage).toBe(110);
  });
});
