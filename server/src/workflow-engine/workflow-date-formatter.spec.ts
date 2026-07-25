import { formatWorkflowDate } from './workflow-date-formatter';

describe('formatWorkflowDate', () => {
  it.each([
    [
      'ro_numeric',
      '19.07.2026',
      '19.07.2026 15:56',
    ],
    [
      'ro_long',
      '19 iulie 2026',
      '19 iulie 2026 15:56',
    ],
    [
      'slash',
      '19/07/2026',
      '19/07/2026 15:56',
    ],
    [
      'iso',
      '2026-07-19',
      '2026-07-19 15:56',
    ],
  ] as const)(
    'formateaza presetul %s',
    (preset, date, datetime) => {
      expect(
        formatWorkflowDate(
          '2026-07-19T12:56:40.000Z',
          preset,
        ),
      ).toEqual({ date, datetime });
    },
  );

  it('aplica ora de vara si ora de iarna pentru Bucuresti', () => {
    expect(
      formatWorkflowDate(
        new Date(
          '2026-07-19T12:56:40.000Z',
        ),
        'iso',
      ).datetime,
    ).toBe('2026-07-19 15:56');
    expect(
      formatWorkflowDate(
        new Date(
          '2026-01-19T12:56:40.000Z',
        ),
        'iso',
      ).datetime,
    ).toBe('2026-01-19 14:56');
  });

  it('pastreaza data calendaristica fara deplasare de fus orar', () => {
    expect(
      formatWorkflowDate(
        '2026-07-19',
        'ro_numeric',
      ),
    ).toEqual({
      date: '19.07.2026',
      datetime: '19.07.2026 00:00',
    });
  });

  it.each([
    'valoare-invalida',
    '2026-02-30',
    new Date('invalid'),
  ])('respinge valoarea invalida %p', (value) => {
    expect(() =>
      formatWorkflowDate(value, 'ro_numeric'),
    ).toThrow('Valoarea nu este o data valida.');
  });
});
