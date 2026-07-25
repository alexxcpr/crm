import { BadRequestException } from '@nestjs/common';
import { WorkflowHttpClientService } from './workflow-http-client.service';

describe('WorkflowHttpClientService security', () => {
  const service = new WorkflowHttpClientService(
    {} as any,
  );

  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '::1',
    'fc00::1',
    'fe80::1',
  ])('blocheaza adresa privata %s', (address) => {
    expect(
      (service as any).isPrivate(address),
    ).toBe(true);
  });

  it('permite o adresa publica', () => {
    expect(
      (service as any).isPrivate('8.8.8.8'),
    ).toBe(false);
  });

  it('respinge credentialele incluse in URL', () => {
    expect(() =>
      (service as any).parseUrl(
        'https://user:secret@example.com/path',
      ),
    ).toThrow(BadRequestException);
  });
});
