import { BadRequestException } from '@nestjs/common';
import { DashboardQueryService } from './dashboard-query.service';

describe('DashboardQueryService limits', () => {
  const service = new DashboardQueryService({} as any, {} as any, {} as any, {} as any);

  it.each([
    [30, 'day'],
    [120, 'week'],
    [500, 'month'],
  ])('alege granularitatea automata pentru %i zile', (days, expected) => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date(from.getTime() + Number(days) * 86_400_000);
    expect((service as any).effectiveGranularity('auto', from, to)).toBe(expected);
  });

  it('reduce granularitatea pentru a nu depasi 100 puncte', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-07-01T00:00:00.000Z');
    expect((service as any).effectiveGranularity('day', from, to)).toBe('week');
  });

  it('valideaza intervalul si timezone-ul IANA', () => {
    expect((service as any).validateRange({
      from: '2026-03-28T22:00:00.000Z',
      to: '2026-03-30T21:00:00.000Z',
      timeZone: 'Europe/Bucharest',
    })).toEqual({
      from: new Date('2026-03-28T22:00:00.000Z'),
      to: new Date('2026-03-30T21:00:00.000Z'),
    });
  });

  it.each([
    [{ from: 'invalid', to: '2026-01-02', timeZone: 'Europe/Bucharest' }],
    [{ from: '2026-01-02', to: '2026-01-01', timeZone: 'Europe/Bucharest' }],
    [{ from: '2026-01-01', to: '2026-01-02', timeZone: 'Invalid/Zone' }],
  ])('respinge intervalele sau timezone-urile invalide', (dto) => {
    expect(() => (service as any).validateRange(dto)).toThrow(BadRequestException);
  });

  it('limiteaza categoriile si seriile dupa valoarea agregata', () => {
    const rows = Array.from({ length: 10 }, (_, series) => [
      { group_key: 'a', series_key: `s${series}`, value: series + 1 },
      { group_key: 'b', series_key: `s${series}`, value: series + 1 },
      { group_key: 'c', series_key: `s${series}`, value: 1 },
    ]).flat();

    const result = (service as any).limitChartRows(rows, 'category', 2, true);
    expect(new Set(result.map((row: any) => row.series_key)).size).toBe(8);
    expect(new Set(result.map((row: any) => row.group_key))).toEqual(new Set(['a', 'b']));
  });
});
