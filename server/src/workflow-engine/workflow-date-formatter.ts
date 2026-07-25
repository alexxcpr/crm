export const WORKFLOW_DATE_FORMAT_PRESETS = [
  'ro_numeric',
  'ro_long',
  'slash',
  'iso',
] as const;

export type WorkflowDateFormatPreset =
  (typeof WORKFLOW_DATE_FORMAT_PRESETS)[number];

export interface WorkflowFormattedDate {
  date: string;
  datetime: string;
}

interface DateParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
}

const BUCHAREST_TIME_ZONE = 'Europe/Bucharest';
const DATE_ONLY_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})$/;
const ROMANIAN_MONTHS = [
  'ianuarie',
  'februarie',
  'martie',
  'aprilie',
  'mai',
  'iunie',
  'iulie',
  'august',
  'septembrie',
  'octombrie',
  'noiembrie',
  'decembrie',
];

export function isWorkflowDateFormatPreset(
  value: unknown,
): value is WorkflowDateFormatPreset {
  return WORKFLOW_DATE_FORMAT_PRESETS.includes(
    value as WorkflowDateFormatPreset,
  );
}

export function formatWorkflowDate(
  value: unknown,
  preset: WorkflowDateFormatPreset,
): WorkflowFormattedDate {
  const parts = dateParts(value);
  const time = `${parts.hour}:${parts.minute}`;

  switch (preset) {
    case 'ro_numeric': {
      const date = `${parts.day}.${parts.month}.${parts.year}`;
      return {
        date,
        datetime: `${date} ${time}`,
      };
    }
    case 'ro_long': {
      const month =
        ROMANIAN_MONTHS[
          Number(parts.month) - 1
        ];
      const date = `${Number(parts.day)} ${month} ${parts.year}`;
      return {
        date,
        datetime: `${date} ${time}`,
      };
    }
    case 'slash': {
      const date = `${parts.day}/${parts.month}/${parts.year}`;
      return {
        date,
        datetime: `${date} ${time}`,
      };
    }
    case 'iso': {
      const date = `${parts.year}-${parts.month}-${parts.day}`;
      return {
        date,
        datetime: `${date} ${time}`,
      };
    }
  }
}

function dateParts(value: unknown): DateParts {
  if (typeof value === 'string') {
    const normalized = value.trim();
    const dateOnly = DATE_ONLY_PATTERN.exec(
      normalized,
    );
    if (dateOnly) {
      const [, year, month, day] = dateOnly;
      assertCalendarDate(year, month, day);
      return {
        year,
        month,
        day,
        hour: '00',
        minute: '00',
      };
    }
  }

  const date =
    value instanceof Date
      ? new Date(value.getTime())
      : typeof value === 'string'
        ? new Date(value)
        : null;
  if (!date || Number.isNaN(date.getTime())) {
    throw new RangeError(
      'Valoarea nu este o data valida.',
    );
  }

  const formatter = new Intl.DateTimeFormat(
    'en-GB',
    {
      timeZone: BUCHAREST_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    },
  );
  const values = new Map(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );

  return {
    year: requiredPart(values, 'year'),
    month: requiredPart(values, 'month'),
    day: requiredPart(values, 'day'),
    hour: requiredPart(values, 'hour'),
    minute: requiredPart(values, 'minute'),
  };
}

function assertCalendarDate(
  year: string,
  month: string,
  day: string,
) {
  const candidate = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
    ),
  );
  if (
    candidate.getUTCFullYear() !== Number(year) ||
    candidate.getUTCMonth() !==
      Number(month) - 1 ||
    candidate.getUTCDate() !== Number(day)
  ) {
    throw new RangeError(
      'Valoarea nu este o data valida.',
    );
  }
}

function requiredPart(
  values: Map<string, string>,
  key: string,
): string {
  const value = values.get(key);
  if (!value) {
    throw new RangeError(
      'Valoarea nu este o data valida.',
    );
  }
  return value;
}
