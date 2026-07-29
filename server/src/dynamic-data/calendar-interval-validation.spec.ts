import { BadRequestException } from '@nestjs/common';
import { DynamicDataService } from './dynamic-data.service';

describe('DynamicDataService calendar interval validation', () => {
  function createService() {
    const mappings = [
      {
        start_column: 'cf_start',
        start_name: 'Început',
        end_column: 'cf_end',
        end_name: 'Final',
      },
    ];
    const builder: any = {
      join: jest.fn(() => builder),
      where: jest.fn(() => builder),
      select: jest
        .fn()
        .mockResolvedValue(mappings),
    };
    const knex: any = jest.fn(() => builder);
    knex.schema = {
      hasTable: jest.fn().mockResolvedValue(true),
    };
    return new DynamicDataService(
      { knex } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  }

  it('permite lipsa uneia sau ambelor date', async () => {
    const service = createService();
    await expect(
      (service as any).validateCalendarIntervals(
        'entity',
        { cf_start: '2026-07-29', cf_end: null },
      ),
    ).resolves.toBeUndefined();
  });

  it('respinge intervalele egale sau inverse', async () => {
    const service = createService();
    await expect(
      (service as any).validateCalendarIntervals(
        'entity',
        {
          cf_start: '2026-07-29',
          cf_end: '2026-07-29',
        },
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      (service as any).validateCalendarIntervals(
        'entity',
        {
          cf_start: '2026-07-30',
          cf_end: '2026-07-29',
        },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('validează perechea când update-ul modifică doar un capăt', async () => {
    const service = createService();
    await expect(
      (service as any).validateCalendarIntervals(
        'entity',
        {
          cf_start: '2026-07-29',
          cf_end: '2026-07-30',
        },
        new Set(['cf_end']),
      ),
    ).resolves.toBeUndefined();
  });
});
