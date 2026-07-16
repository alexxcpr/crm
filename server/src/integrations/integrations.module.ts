import { Module } from '@nestjs/common';
import { AdminIntegrationsController } from './admin-integrations.controller';
import { IntegrationCryptoService } from './integration-crypto.service';
import { IntegrationsService } from './integrations.service';
import { SmtpMailService } from './smtp-mail.service';

@Module({
  controllers: [AdminIntegrationsController],
  providers: [IntegrationCryptoService, IntegrationsService, SmtpMailService],
  exports: [IntegrationsService, SmtpMailService],
})
export class IntegrationsModule {}
