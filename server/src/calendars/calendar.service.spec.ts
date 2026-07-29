import { BadRequestException } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import type { SaveCalendarDto } from './dto/calendar.dto';

describe('CalendarService configuration validation', () => {
  const service = new CalendarService(
    {} as any,
    {} as any,
    {} as any,
  );
  const entity = {
    id_entity:
      '10000000-0000-4000-8000-000000000001',
    slug: 'appointments',
  };
  const fields = [
    {
      id_field:
        '20000000-0000-4000-8000-000000000001',
      id_entity: entity.id_entity,
      name: 'Început',
      slug: 'start',
      column_name: 'cf_start',
      data_type: 'datetime',
      ui_type: 'datetimepicker',
      is_filterable: true,
      is_readonly: false,
      visible_in_form: true,
    },
    {
      id_field:
        '20000000-0000-4000-8000-000000000002',
      id_entity: entity.id_entity,
      name: 'Final',
      slug: 'end',
      column_name: 'cf_end',
      data_type: 'datetime',
      ui_type: 'datetimepicker',
      is_filterable: true,
      is_readonly: false,
      visible_in_form: true,
    },
    {
      id_field:
        '20000000-0000-4000-8000-000000000003',
      id_entity: entity.id_entity,
      name: 'Titlu',
      slug: 'title',
      column_name: 'cf_title',
      data_type: 'varchar',
      ui_type: 'text',
      is_filterable: true,
      is_readonly: false,
      visible_in_form: true,
    },
  ];

  function database() {
    return ((table: string) => ({
      whereIn: jest
        .fn()
        .mockResolvedValue(
          table === 'entity' ? [entity] : fields,
        ),
    })) as any;
  }

  function calendar(
    overrides: Partial<SaveCalendarDto> = {},
  ): SaveCalendarDto {
    return {
      name: 'Programări',
      slug: 'programari',
      description: null,
      icon: null,
      default_view: 'month',
      allow_day: true,
      allow_week: true,
      allow_month: true,
      allow_list: true,
      list_range: 'month',
      first_day: 1,
      show_weekends: true,
      slot_min_time: '00:00',
      slot_max_time: '24:00',
      scroll_time: '08:00',
      slot_duration_minutes: 30,
      rank: 0,
      is_active: true,
      sources: [
        {
          id_entity: entity.id_entity,
          name: 'Programări',
          color: '#2563eb',
          id_start_field: fields[0].id_field,
          id_end_field: fields[1].id_field,
          title_segments: [
            {
              type: 'field',
              id_field: fields[2].id_field,
            },
          ],
          filters: [],
          popover_field_ids: [fields[2].id_field],
          allow_create: true,
          allow_update: true,
          rank: 0,
          is_active: true,
        },
      ],
      ...overrides,
    };
  }

  it('acceptă o sursă timed validă', async () => {
    await expect(
      (service as any).validateConfiguration(
        database(),
        calendar(),
      ),
    ).resolves.toBeUndefined();
  });

  it('respinge un calendar activ fără surse active', async () => {
    const dto = calendar();
    dto.sources[0].is_active = false;
    await expect(
      (service as any).validateConfiguration(
        database(),
        dto,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('respinge peste zece surse active', async () => {
    const source = calendar().sources[0];
    const dto = calendar({
      sources: Array.from(
        { length: 11 },
        (_, rank) => ({ ...source, rank }),
      ),
    });
    await expect(
      (service as any).validateConfiguration(
        database(),
        dto,
      ),
    ).rejects.toThrow('maximum 10 surse active');
  });

  it('impune un token de câmp în titlu', async () => {
    const dto = calendar();
    dto.sources[0].title_segments = [
      { type: 'text', value: 'Fix' },
    ];
    await expect(
      (service as any).validateConfiguration(
        database(),
        dto,
      ),
    ).rejects.toThrow('cel puțin un câmp');
  });

  it('impune vederea implicită activă și o grilă cronologică', async () => {
    await expect(
      (service as any).validateConfiguration(
        database(),
        calendar({ allow_month: false }),
      ),
    ).rejects.toThrow('Vederea implicită');
    await expect(
      (service as any).validateConfiguration(
        database(),
        calendar({
          slot_min_time: '18:00',
          slot_max_time: '08:00',
        }),
      ),
    ).rejects.toThrow('Ora de final');
  });
});
