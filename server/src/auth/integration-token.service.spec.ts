import * as argon2 from 'argon2';
import { UnauthorizedException } from '@nestjs/common';
import { IntegrationTokenService } from './integration-token.service';

describe('IntegrationTokenService', () => {
  const prefix = 'a'.repeat(16);
  const secret = 'b'.repeat(43);
  const token = `mvi_${prefix}.${secret}`;

  it('valideaza hash-ul si construieste actorul profilului legat', async () => {
    const row = {
      id_integration_token: 'token-id',
      id_profile: 'profile-id',
      token_prefix: prefix,
      secret_hash: await argon2.hash(secret),
      scopes: ['builder:read', 'data:write'],
      revoked_at: null,
      expires_at: null,
    };
    const update = jest.fn().mockResolvedValue(1);
    const integrationBuilder: any = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(row),
      whereNull: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      update,
    };
    const profileBuilder: any = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ id_user: 'user-id' }),
    };
    const knex = jest.fn((table: string) =>
      table === 'profile' ? profileBuilder : integrationBuilder,
    );
    const actor = { profileId: 'profile-id' };
    const users = { load: jest.fn().mockResolvedValue(actor) };
    const service = new IntegrationTokenService(
      { knex } as any,
      users as any,
    );

    await expect(service.authenticate(token)).resolves.toBe(actor);
    expect(users.load).toHaveBeenCalledWith('user-id', 'profile-id', {
      type: 'integration_token',
      integrationTokenId: 'token-id',
      integrationScopes: ['builder:read', 'data:write'],
    });
    expect(update).toHaveBeenCalled();
  });

  it.each([
    ['revocat', { revoked_at: new Date(), expires_at: null }],
    [
      'expirat',
      { revoked_at: null, expires_at: new Date(Date.now() - 1_000) },
    ],
  ])('respinge token-ul %s', async (_label, state) => {
    const builder: any = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({
        token_prefix: prefix,
        secret_hash: await argon2.hash(secret),
        ...state,
      }),
    };
    const service = new IntegrationTokenService(
      { knex: jest.fn(() => builder) } as any,
      { load: jest.fn() } as any,
    );
    await expect(service.authenticate(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('respinge un token absent din baza tenant-ului curent', async () => {
    const builder: any = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(undefined),
    };
    const service = new IntegrationTokenService(
      { knex: jest.fn(() => builder) } as any,
      { load: jest.fn() } as any,
    );
    await expect(service.authenticate(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('respinge token-ul cand profilul asociat este dezactivat', async () => {
    const integrationBuilder: any = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({
        id_integration_token: 'token-id',
        id_profile: 'profile-id',
        token_prefix: prefix,
        secret_hash: await argon2.hash(secret),
        scopes: ['builder:read'],
        revoked_at: null,
        expires_at: null,
      }),
    };
    const profileBuilder: any = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(undefined),
    };
    const service = new IntegrationTokenService(
      {
        knex: jest.fn((table: string) =>
          table === 'profile' ? profileBuilder : integrationBuilder,
        ),
      } as any,
      { load: jest.fn() } as any,
    );
    await expect(service.authenticate(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
