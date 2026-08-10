import { IntegrationTokenStrategy } from './integration-token.strategy';

describe('IntegrationTokenStrategy', () => {
  it('cedeaza JWT-urile strategiei urmatoare', async () => {
    const tokens = { authenticate: jest.fn() } as any;
    const strategy = new IntegrationTokenStrategy(tokens);
    await expect(strategy.validate('eyJhbGciOiJIUzI1NiJ9.payload.signature')).resolves.toBe(false);
    expect(tokens.authenticate).not.toHaveBeenCalled();
  });

  it('autentifica doar token-urile Moduvis', async () => {
    const actor = { profileId: 'profile-id' };
    const tokens = { authenticate: jest.fn().mockResolvedValue(actor) } as any;
    const strategy = new IntegrationTokenStrategy(tokens);
    await expect(strategy.validate('mvi_aaaaaaaaaaaaaaaa.secret')).resolves.toBe(actor);
    expect(tokens.authenticate).toHaveBeenCalledTimes(1);
  });
});
