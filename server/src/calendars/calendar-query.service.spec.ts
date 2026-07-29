import { BadRequestException } from '@nestjs/common';
import { CalendarQueryService } from './calendar-query.service';

describe('CalendarQueryService interval and timezone rules', () => {
  const service = new CalendarQueryService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  it('acceptă intervalul semi-deschis de maximum 62 de zile', () => {
    expect(
      (service as any).validateRange({
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-03-04T00:00:00.000Z',
      }),
    ).toEqual({
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-03-04T00:00:00.000Z'),
    });
  });

  it.each([
    [{ from: 'invalid', to: '2026-01-02' }],
    [{ from: '2026-01-02', to: '2026-01-01' }],
    [{ from: '2026-01-01', to: '2026-03-05' }],
  ])(
    'respinge intervale invalide sau mai mari de 62 zile',
    (dto) => {
      expect(() =>
        (service as any).validateRange(dto),
      ).toThrow(BadRequestException);
    },
  );

  it('respinge intervalele egale și inverse', () => {
    expect(() =>
      (service as any).assertInterval(
        '2026-07-29',
        '2026-07-29',
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      (service as any).assertInterval(
        '2026-07-30',
        '2026-07-29',
      ),
    ).toThrow(BadRequestException);
  });

  it('formatează datele all-day în timezone-ul tenantului inclusiv la DST', () => {
    expect(
      (service as any).formatDateOnly(
        new Date('2026-03-28T22:00:00.000Z'),
        'Europe/Bucharest',
      ),
    ).toBe('2026-03-29');
    expect(
      (service as any).formatDateOnly(
        new Date('2026-10-24T21:00:00.000Z'),
        'Europe/Bucharest',
      ),
    ).toBe('2026-10-25');
  });

  it('păstrează end-ul all-day exclusiv în eveniment', () => {
    const source = {
      id_ui_calendar_source: 'source',
      name: 'Concedii',
      entity_slug: 'leave',
      entity_label: 'Concediu',
      color: '#16a34a',
      allow_update: true,
      capabilities: { update: true },
      start_field: {
        id_field: 'start',
        column_name: 'cf_start',
        ui_type: 'datepicker',
        is_readonly: false,
      },
      end_field: {
        id_field: 'end',
        column_name: 'cf_end',
        ui_type: 'datepicker',
        is_readonly: false,
      },
      fields: [],
      title_segments: [],
      popover_fields: [],
    };
    const event = (service as any).toEvent(
      source,
      {
        id: 'record-id',
        cf_start: '2026-07-29',
        cf_end: '2026-07-30',
      },
      'Europe/Bucharest',
      'ro-RO',
      true,
    );
    expect(event.start).toBe('2026-07-29');
    expect(event.end).toBe('2026-07-30');
    expect(event.allDay).toBe(true);
    expect(event.id).toBe('source:record-id');
  });

  it('mută intervalul prin fluxul CRUD normal', async () => {
    const dynamicData = {
      update: jest.fn().mockResolvedValue({
        data: { id: 'record' },
      }),
    };
    const calendars = {
      findBySlugPublic: jest
        .fn()
        .mockResolvedValue({
          sources: [
            {
              id_ui_calendar_source: 'source-id',
              entity_slug: 'appointments',
              allow_update: true,
              capabilities: { update: true },
              start_field: {
                slug: 'start',
                ui_type: 'datetimepicker',
              },
              end_field: {
                slug: 'end',
                ui_type: 'datetimepicker',
              },
            },
          ],
        }),
    };
    const intervalService =
      new CalendarQueryService(
        {} as any,
        {} as any,
        { requireEnabled: jest.fn() } as any,
        calendars as any,
        dynamicData as any,
        {} as any,
      );

    await intervalService.updateInterval(
      'programari',
      'source-id',
      'record',
      {
        start: '2026-07-29T09:00:00.000Z',
        end: '2026-07-29T10:00:00.000Z',
        all_day: false,
      },
      {} as any,
    );

    expect(
      dynamicData.update,
    ).toHaveBeenCalledWith(
      'appointments',
      'record',
      {
        start: '2026-07-29T09:00:00.000Z',
        end: '2026-07-29T10:00:00.000Z',
      },
      expect.anything(),
    );
  });

  it('blochează conversia timed/all-day la drag', async () => {
    const intervalService =
      new CalendarQueryService(
        {} as any,
        {} as any,
        { requireEnabled: jest.fn() } as any,
        {
          findBySlugPublic: jest
            .fn()
            .mockResolvedValue({
              sources: [
                {
                  id_ui_calendar_source:
                    'source-id',
                  allow_update: true,
                  capabilities: { update: true },
                  start_field: {
                    slug: 'start',
                    ui_type: 'datetimepicker',
                  },
                  end_field: {
                    slug: 'end',
                    ui_type: 'datetimepicker',
                  },
                },
              ],
            }),
        } as any,
        { update: jest.fn() } as any,
        {} as any,
      );

    await expect(
      intervalService.updateInterval(
        'programari',
        'source-id',
        'record',
        {
          start: '2026-07-29',
          end: '2026-07-30',
          all_day: true,
        },
        {} as any,
      ),
    ).rejects.toThrow('Conversia');
  });
});
