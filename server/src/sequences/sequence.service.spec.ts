import { BadRequestException } from '@nestjs/common';
import { SequenceService } from './sequence.service';

describe('SequenceService', () => {
  const service = new SequenceService({} as any);

  const parts = {
    day: '11',
    month: '08',
    year: '2026',
  };

  it.each([
    ['{prefix}{number}', 'CLI-', 1, 1n, 'CLI-1'],
    ['{prefix}{number}', 'LOC-', 5, 1n, 'LOC-00001'],
    [
      '{prefix}{year}-{number}',
      'INT-',
      1,
      1n,
      'INT-2026-1',
    ],
    [
      '{prefix} / {number} / {day}/{month}/{year}',
      'INT',
      1,
      1n,
      'INT / 1 / 11/08/2026',
    ],
  ])(
    'formateaza %s',
    (format, prefix, padding, value, expected) => {
      expect(
        service.formatValue(
          { format, prefix, padding },
          value,
          parts,
        ),
      ).toBe(expected);
    },
  );

  it('nu trunchiaza numarul care depaseste padding-ul', () => {
    expect(
      service.formatValue(
        {
          format: '{prefix}{number}',
          prefix: 'CLI-',
          padding: 2,
        },
        123n,
        parts,
      ),
    ).toBe('CLI-123');
  });

  it('calculeaza data in fusul tenantului la limita de an', () => {
    expect(
      service.dateParts(
        new Date('2025-12-31T22:30:00.000Z'),
        'Europe/Bucharest',
      ),
    ).toEqual({ day: '01', month: '01', year: '2026' });
  });

  it.each([
    {
      key: 'test',
      scope: 'global' as const,
      reset: 'none' as const,
      format: '{prefix}',
    },
    {
      key: 'test',
      scope: 'global' as const,
      reset: 'none' as const,
      format: '{number}-{unknown}',
    },
    {
      key: 'test',
      scope: 'global' as const,
      reset: 'yearly' as const,
      format: '{prefix}{number}',
    },
    {
      key: 'test',
      scope: 'global' as const,
      reset: 'none' as const,
      format: '{number',
    },
  ])('refuza manifestul invalid %#', (manifest) => {
    expect(() => service.normalizeManifest(manifest)).toThrow(
      BadRequestException,
    );
  });

  it('refuza completarea manuala a campului secvential', () => {
    expect(() =>
      service.assertNoOverrides(
        { number: 'CLI-1' },
        [
          {
            name: 'Numar',
            slug: 'number',
            column_name: 'cf_number',
            sequence: { key: 'clients' },
          } as any,
        ],
      ),
    ).toThrow(BadRequestException);
  });

  it('refuza modificarea numarului de catre before_insert', () => {
    expect(() =>
      service.assertGeneratedValuesUnchanged(
        new Map([['cf_number', 'CLI-1']]),
        { cf_number: 'CLI-2' },
      ),
    ).toThrow(BadRequestException);
  });
});
