import { BadRequestException } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';

describe('IntegrationsService', () => {
  it('respinge combinatia Gmail 465 fara TLS direct', async () => {
    const service = new IntegrationsService(
      { knex: jest.fn() } as any,
      {} as any,
      {} as any,
    );

    await expect(service.createSmtp({
      name: 'Gmail', host: 'smtp.gmail.com', port: 465, security: 'none',
      username: 'mailer@gmail.com', password: 'secret', fromName: 'Moduvis',
      fromEmail: 'mailer@gmail.com', rejectUnauthorized: true, isActive: true,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('nu expune parola sau ciphertext-ul la creare', async () => {
    const row = {
      id_integration: 'smtp-1',
      type: 'smtp',
      name: 'SMTP Principal',
      config: {
        host: 'smtp.example.com', port: 587, security: 'starttls', username: 'mailer',
        fromName: 'Moduvis', fromEmail: 'noreply@example.com', rejectUnauthorized: true,
      },
      secret_encrypted: 'ciphertext',
      is_active: true,
      id_replaced_by: null,
      date_deleted: null,
      date_created: new Date(),
      date_updated: new Date(),
    };
    const returning = jest.fn().mockResolvedValue([row]);
    const insert = jest.fn().mockReturnValue({ returning });
    const knex = jest.fn().mockReturnValue({ insert });
    const service = new IntegrationsService(
      { knex } as any,
      { encrypt: jest.fn().mockReturnValue('ciphertext') } as any,
      {} as any,
    );

    const result = await service.createSmtp({
      name: 'SMTP Principal', host: 'smtp.example.com', port: 587, security: 'starttls',
      username: 'mailer', password: 'secret', fromName: 'Moduvis',
      fromEmail: 'noreply@example.com', rejectUnauthorized: true, isActive: true,
    });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ secret_encrypted: 'ciphertext' }));
    expect(result.data).toEqual(expect.objectContaining({ hasPassword: true }));
    expect(result.data).not.toHaveProperty('secret_encrypted');
    expect(result.data).not.toHaveProperty('password');
  });

  it('inlocuieste referintele si emite resincronizarea workflow-urilor', async () => {
    const workflowUpdates: any[] = [];
    const integrationUpdates: any[] = [];
    const trx = jest.fn((table: string) => ({
      where: jest.fn().mockReturnValue({
        update: jest.fn((patch) => {
          if (table === 'workflow_definition') workflowUpdates.push(patch);
          else integrationUpdates.push(patch);
          return Promise.resolve(1);
        }),
      }),
    }));
    const knex: any = jest.fn();
    knex.transaction = jest.fn(async (callback) => callback(trx));
    const events = { emitAsync: jest.fn().mockResolvedValue([]) };
    const service = new IntegrationsService({ knex } as any, {} as any, events as any);
    jest.spyOn(service as any, 'findRow')
      .mockResolvedValueOnce({ id_integration: 'old', type: 'smtp', name: 'Vechi' })
      .mockResolvedValueOnce({ id_integration: 'new', type: 'smtp', name: 'Nou', is_active: true });
    jest.spyOn(service as any, 'workflowsUsing').mockResolvedValue([{
      id_workflow: 'wf-1', version: 3,
      nodes: [{ id: 'email', type: 'email', parameters: { integrationId: 'old', integrationName: 'Vechi' } }],
    }]);

    await service.remove('old', 'new');

    expect(workflowUpdates[0].version).toBe(4);
    expect(JSON.parse(workflowUpdates[0].nodes)[0].parameters).toEqual(expect.objectContaining({
      integrationId: 'new', integrationName: 'Nou',
    }));
    expect(integrationUpdates[0]).toEqual(expect.objectContaining({ is_active: false, id_replaced_by: 'new' }));
    expect(events.emitAsync).toHaveBeenCalledWith('integration.replaced', expect.objectContaining({ workflowIds: ['wf-1'] }));
  });
});
