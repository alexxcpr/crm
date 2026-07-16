import { ServiceUnavailableException } from '@nestjs/common';
import { IntegrationCryptoService } from './integration-crypto.service';

describe('IntegrationCryptoService', () => {
  it('cripteaza cu IV aleator si decripteaza parola', () => {
    const service = new IntegrationCryptoService({
      get: jest.fn().mockReturnValue('a-very-long-random-integration-secret-key'),
    } as any);

    const first = service.encrypt('smtp-secret');
    const second = service.encrypt('smtp-secret');

    expect(first).not.toBe(second);
    expect(first).not.toContain('smtp-secret');
    expect(service.decrypt(first)).toBe('smtp-secret');
  });

  it('esueaza inchis cand cheia lipseste', () => {
    const service = new IntegrationCryptoService({ get: jest.fn().mockReturnValue('short') } as any);
    expect(() => service.encrypt('smtp-secret')).toThrow(ServiceUnavailableException);
  });
});
