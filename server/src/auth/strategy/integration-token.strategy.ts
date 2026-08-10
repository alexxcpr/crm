import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-http-bearer';
import { IntegrationTokenService } from '../integration-token.service';

@Injectable()
export class IntegrationTokenStrategy extends PassportStrategy(
  Strategy,
  'integration-token',
) {
  constructor(private readonly tokens: IntegrationTokenService) {
    super();
  }

  async validate(token: string) {
    if (!token.startsWith('mvi_')) return false;
    return this.tokens.authenticate(token);
  }
}
