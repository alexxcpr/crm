import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { WorkflowScheduleExpressionService } from './workflow-schedule-expression.service';
import { WorkflowScheduleService } from './workflow-schedule.service';

describe('WorkflowScheduleService rules', () => {
  function serviceWith(
    knex: any,
    runtime: any = {
      execute: jest.fn(),
    },
  ) {
    const service = new WorkflowScheduleService(
      {
        knex,
        slug: 'demo',
      } as any,
      new WorkflowScheduleExpressionService(),
      {} as any,
      runtime,
      {} as any,
      {} as any,
      {} as any,
    );
    (service as any).logger.error = jest.fn();
    return service;
  }

  it('refuza depasirea limitei de 100 de programari active', async () => {
    const query: any = {
      where: jest.fn(() => query),
      count: jest.fn(() => query),
      first: jest
        .fn()
        .mockResolvedValue({ count: '100' }),
    };
    const service = serviceWith(
      jest.fn(() => query),
    );

    await expect(
      (service as any).assertActiveCapacity(),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuza o rulare unica in trecut', () => {
    const service = serviceWith(jest.fn());

    expect(() =>
      (service as any).definition(
        'once',
        undefined,
        '2020-01-01T00:00:00.000Z',
        'Europe/Bucharest',
      ),
    ).toThrow(BadRequestException);
  });

  it('dezactiveaza programarea unica dupa aparitie', () => {
    const service = serviceWith(jest.fn());

    expect(
      (service as any).advance(
        {
          schedule_type: 'once',
        },
        new Date(),
      ),
    ).toEqual({
      is_active: false,
      next_run_at: null,
    });
  });

  it('nu reincearca automat o executie esuata', async () => {
    const query: any = {
      where: jest.fn(() => query),
      update: jest.fn().mockResolvedValue(1),
    };
    const runtime = {
      execute: jest
        .fn()
        .mockRejectedValue(
          new Error('workflow failed'),
        ),
    };
    const service = serviceWith(
      jest.fn(() => query),
      runtime,
    );
    const claim = {
      schedule: {
        id_schedule: 'schedule-id',
        id_workflow: 'workflow-id',
        name: 'Raport',
        timezone: 'Europe/Bucharest',
      },
      scheduledFor: new Date(
        '2026-07-30T09:00:00.000Z',
      ),
      lockToken: 'lease-id',
      actor: {
        id: 'scheduler-user',
        profileId: 'scheduler-profile',
      },
    } as any;

    await service.executeClaim(claim);

    expect(runtime.execute).toHaveBeenCalledTimes(
      1,
    );
    expect(query.update).toHaveBeenCalledWith({
      lock_token: null,
      locked_until: null,
    });
  });
});
