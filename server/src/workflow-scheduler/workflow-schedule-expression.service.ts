import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { CronTime } from 'cron';

@Injectable()
export class WorkflowScheduleExpressionService {
  normalize(expression: string): string {
    const normalized = String(expression ?? '')
      .trim()
      .replace(/\s+/g, ' ');
    if (normalized.split(' ').length !== 5) {
      throw new BadRequestException(
        'Expresia cron trebuie sa aiba exact 5 campuri, fara secunde.',
      );
    }
    const validation =
      CronTime.validateCronExpression(normalized);
    if (!validation.valid) {
      throw new BadRequestException(
        'Expresia cron nu este valida.',
      );
    }
    return normalized;
  }

  validateTimezone(timezone: string): string {
    const normalized = String(
      timezone ?? '',
    ).trim();
    try {
      new Intl.DateTimeFormat('ro-RO', {
        timeZone: normalized,
      }).format(new Date());
    } catch {
      throw new BadRequestException(
        'Timezone-ul selectat nu este valid.',
      );
    }
    return normalized;
  }

  next(
    expression: string,
    timezone: string,
    after = new Date(),
  ): Date {
    const cron = new CronTime(
      this.normalize(expression),
      this.validateTimezone(timezone),
    );
    return cron
      .getNextDateFrom(after, timezone)
      .toJSDate();
  }

  preview(
    expression: string,
    timezone: string,
    count = 5,
    after = new Date(),
  ) {
    const normalized = this.normalize(expression);
    const zone = this.validateTimezone(timezone);
    const cron = new CronTime(normalized, zone);
    const result: Array<{
      utc: string;
      local: string;
    }> = [];
    let cursor = after;
    const formatter = new Intl.DateTimeFormat(
      'ro-RO',
      {
        timeZone: zone,
        dateStyle: 'medium',
        timeStyle: 'short',
      },
    );
    for (
      let index = 0;
      index < count;
      index += 1
    ) {
      const next = cron.getNextDateFrom(
        cursor,
        zone,
      );
      const date = next.toJSDate();
      result.push({
        utc: date.toISOString(),
        local: formatter.format(date),
      });
      cursor = date;
    }
    return {
      cronExpression: normalized,
      timezone: zone,
      occurrences: result,
    };
  }

  describe(
    scheduleType: 'cron' | 'once',
    cronExpression: string | null,
    runAt: Date | string | null,
    timezone: string,
  ): string {
    if (scheduleType === 'once') {
      if (!runAt) return 'O singura data';
      return `O singura data: ${new Intl.DateTimeFormat(
        'ro-RO',
        {
          timeZone: timezone,
          dateStyle: 'medium',
          timeStyle: 'short',
        },
      ).format(new Date(runAt))}`;
    }
    const expression = String(
      cronExpression ?? '',
    );
    let match = expression.match(
      /^\*\/(\d+) \* \* \* \*$/,
    );
    if (match) {
      return `La fiecare ${match[1]} minute`;
    }
    match = expression.match(
      /^0 \*\/(\d+) \* \* \*$/,
    );
    if (match) {
      return `La fiecare ${match[1]} ore`;
    }
    match = expression.match(
      /^(\d{1,2}) (\d{1,2}) \* \* \*$/,
    );
    if (match) {
      return `Zilnic la ${match[2].padStart(2, '0')}:${match[1].padStart(2, '0')}`;
    }
    return `Cron: ${expression}`;
  }
}
