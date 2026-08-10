import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategy/jwt.strategy';
import { AuthenticatedUserService } from './authenticated-user.service';
import { IntegrationTokenService } from './integration-token.service';
import { IntegrationTokenStrategy } from './strategy/integration-token.strategy';
import { IntegrationTokenController } from './integration-token.controller';
import { ApiAuthGuard } from './api-auth.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '30m' },
      }),
    }),
  ],
  controllers: [AuthController, IntegrationTokenController],
  providers: [
    AuthService,
    AuthenticatedUserService,
    IntegrationTokenService,
    JwtStrategy,
    IntegrationTokenStrategy,
    ApiAuthGuard,
  ],
  exports: [ApiAuthGuard, IntegrationTokenService],
})
export class AuthModule {}
