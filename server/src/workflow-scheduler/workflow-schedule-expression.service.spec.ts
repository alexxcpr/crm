import { BadRequestException } from '@nestjs/common';
import { WorkflowScheduleExpressionService } from './workflow-schedule-expression.service';

describe('WorkflowScheduleExpressionService', () => {
  const service =
    new WorkflowScheduleExpressionService();

  it('normalizeaza cron standard cu 5 campuri', () => {
    expect(
      service.normalize('  */5   * * * *  '),
    ).toBe('*/5 * * * *');
  });

  it('refuza expresiile cron cu secunde', () => {
    expect(() =>
      service.normalize('0 */5 * * * *'),
    ).toThrow(BadRequestException);
  });

  it('refuza timezone-uri inexistente', () => {
    expect(() =>
      service.validateTimezone('Europe/Moduvis'),
    ).toThrow(BadRequestException);
  });

  it('returneaza urmatoarele cinci aparitii', () => {
    const preview = service.preview(
      '*/15 * * * *',
      'Europe/Bucharest',
      5,
      new Date('2026-07-30T10:02:00Z'),
    );
    expect(preview.occurrences).toHaveLength(5);
    expect(preview.occurrences[0].utc).toBe(
      '2026-07-30T10:15:00.000Z',
    );
  });

  it('respecta schimbarea DST a timezone-ului', () => {
    const next = service.next(
      '30 3 * * *',
      'Europe/Bucharest',
      new Date('2026-03-28T22:00:00Z'),
    );
    expect(next.toISOString()).toBe(
      '2026-03-29T01:00:00.000Z',
    );
  });
});
