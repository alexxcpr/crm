import { AuthService } from './auth.service';

describe('AuthService session lifetime', () => {
  const nowMs = 1_800_000_000_000;

  function setup() {
    const insert = jest.fn().mockResolvedValue(undefined);
    const update = jest.fn().mockResolvedValue(1);
    const query = { insert, where: jest.fn().mockReturnThis(), update };
    const knex: any = jest.fn(() => query);
    const jwt = {
      signAsync: jest.fn()
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token'),
      verifyAsync: jest.fn(),
    };
    const service = new AuthService(
      { knex, slug: 'dev', dbName: 'devdb' } as any,
      jwt as any,
      { get: jest.fn() } as any,
    );
    return { service, jwt, knex, insert, update, query };
  }

  function setupRotation(storedToken: object | null = { jti: 'old' }) {
    const stored = {
      where: jest.fn().mockReturnThis(),
      forUpdate: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(storedToken),
    };
    const profile = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ id_profile: 'profile-2' }),
    };
    const revoke = {
      where: jest.fn().mockReturnThis(),
      update: jest.fn().mockResolvedValue(1),
    };
    let refreshQueries = 0;
    const trx: any = jest.fn((table: string) => {
      if (table === 'profile') return profile;
      refreshQueries++;
      return refreshQueries === 1 ? stored : revoke;
    });
    trx.fn = { now: jest.fn().mockReturnValue('db-now') };
    const knex: any = jest.fn();
    knex.transaction = jest.fn(async (callback: (transaction: any) => unknown) => callback(trx));
    const jwt = { verifyAsync: jest.fn(), signAsync: jest.fn() };
    const service = new AuthService(
      { knex, slug: 'dev', dbName: 'devdb' } as any,
      jwt as any,
      { get: jest.fn() } as any,
    );
    const signToken = jest.spyOn(service as any, 'signToken').mockResolvedValue({
      accessToken: 'access-new', refreshToken: 'refresh-new',
    });
    return { service, jwt, knex, trx, stored, profile, revoke, signToken };
  }

  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(nowMs));
  afterEach(() => jest.restoreAllMocks());

  it('creeaza o sesiune absoluta de 24 de ore si access token de 30 de minute', async () => {
    const { service, jwt, insert } = setup();
    const result = await (service as any).signToken('user-1', 'profile-1');
    const now = Math.floor(nowMs / 1000);

    expect(result).toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' });
    expect(jwt.signAsync.mock.calls[0][0]).toMatchObject({ sessionExp: now + 86_400 });
    expect(jwt.signAsync.mock.calls[0][1]).toEqual({ expiresIn: 1_800 });
    expect(jwt.signAsync.mock.calls[1][1]).toEqual({ expiresIn: 86_400 });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      expires_at: new Date((now + 86_400) * 1000),
    }));
  });

  it('pastreaza limita initiala la rotire', async () => {
    const { service, jwt } = setup();
    const now = Math.floor(nowMs / 1000);
    await (service as any).signToken('user-1', 'profile-1', now + 600);

    expect(jwt.signAsync.mock.calls[0][0]).toMatchObject({ sessionExp: now + 600 });
    expect(jwt.signAsync.mock.calls[0][1]).toEqual({ expiresIn: 600 });
    expect(jwt.signAsync.mock.calls[1][1]).toEqual({ expiresIn: 600 });
  });

  it('foloseste exp pentru refresh tokenurile vechi', () => {
    const { service } = setup();
    expect((service as any).resolveSessionExpiry({ exp: 1234 })).toBe(1234);
  });

  it('roteste refresh tokenul atomic si pastreaza expirarea absoluta', async () => {
    const { service, jwt, revoke, signToken } = setupRotation();
    const sessionExp = Math.floor(nowMs / 1000) + 900;
    jwt.verifyAsync.mockResolvedValue({
      sub: 'user-1', profileId: 'profile-1', jti: 'old', sessionExp,
    });

    await service.refreshToken('refresh-old');

    expect(revoke.where).toHaveBeenCalledWith('jti', 'old');
    expect(revoke.update).toHaveBeenCalledWith({ is_revoked: true });
    expect(signToken).toHaveBeenCalledWith('user-1', 'profile-1', sessionExp, expect.any(Function));
  });

  it('refuza rotirea unui refresh token deja revocat', async () => {
    const { service, jwt, signToken } = setupRotation(null);
    jwt.verifyAsync.mockResolvedValue({
      sub: 'user-1', profileId: 'profile-1', jti: 'old',
      sessionExp: Math.floor(nowMs / 1000) + 900,
    });

    await expect(service.refreshToken('refresh-old')).rejects.toMatchObject({ status: 401 });
    expect(signToken).not.toHaveBeenCalled();
  });

  it('schimba profilul fara sa prelungeasca sesiunea si revoca tokenul vechi', async () => {
    const { service, jwt, revoke, signToken } = setupRotation();
    const sessionExp = Math.floor(nowMs / 1000) + 1200;
    jwt.verifyAsync.mockResolvedValue({
      sub: 'user-1', profileId: 'profile-1', jti: 'old', sessionExp,
    });

    await service.switchProfile('user-1', 'profile-2', 'refresh-old');

    expect(revoke.update).toHaveBeenCalledWith({ is_revoked: true });
    expect(signToken).toHaveBeenCalledWith('user-1', 'profile-2', sessionExp, expect.any(Function));
  });

  it('logout revoca toate tokenurile profilului in toate taburile', async () => {
    const { service, jwt, query, update } = setup();
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', profileId: 'profile-1', jti: 'old' });

    await service.signout('refresh-token');

    expect(query.where).toHaveBeenCalledWith({ user_id: 'user-1', profile_id: 'profile-1' });
    expect(update).toHaveBeenCalledWith({ is_revoked: true });
  });
});
