import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const actor = {
    id: 'user-id',
    profileId: 'profile-id',
    roles: [],
  } as any;

  it('marcheaza doar notificarea profilului curent', async () => {
    const returning = jest.fn().mockResolvedValue([{ id_notification: 'notification-id', is_read: true }]);
    const update = jest.fn().mockReturnValue({ returning });
    const where = jest.fn().mockReturnValue({ update });
    const knex = jest.fn().mockReturnValue({ where });
    const service = new NotificationsService({ knex } as any, {} as any);

    await service.setRead('profile-id', 'notification-id', true);

    expect(where).toHaveBeenCalledWith({
      id_notification: 'notification-id',
      id_profile: 'profile-id',
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ is_read: true }));
  });

  it('nu permite modificarea unei notificari din alt profil', async () => {
    const returning = jest.fn().mockResolvedValue([]);
    const update = jest.fn().mockReturnValue({ returning });
    const where = jest.fn().mockReturnValue({ update });
    const knex = jest.fn().mockReturnValue({ where });
    const service = new NotificationsService({ knex } as any, {} as any);

    await expect(service.setRead('profile-id', 'other-notification', true))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('returneaza notificarea existenta la retry idempotent', async () => {
    const existing = { id_notification: 'existing-id' };
    const insertBuilder = {
      insert: jest.fn().mockReturnThis(),
      onConflict: jest.fn().mockReturnThis(),
      ignore: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([]),
    };
    const existingBuilder = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(existing),
    };
    const knex = jest.fn()
      .mockReturnValueOnce(insertBuilder)
      .mockReturnValueOnce(existingBuilder);
    const service = new NotificationsService({ knex } as any, {} as any);
    jest.spyOn(service as any, 'buildRecipientActor').mockResolvedValue(actor);

    const result = await service.createFromWorkflow({
      recipientProfileId: 'profile-id',
      subject: 'Subiect',
      content: 'Continut',
      sourceExecutionId: 'execution-id',
      sourceNodeId: 'node-id',
      sourceRunIndex: 0,
      sourceItemIndex: 0,
    }, actor);

    expect(result).toEqual({ data: existing, created: false });
    expect(insertBuilder.onConflict).toHaveBeenCalledWith([
      'source_execution_id',
      'source_node_id',
      'source_run_index',
      'source_item_index',
    ]);
  });
});
