import { Module } from '@nestjs/common';
import { StorageModule } from 'src/storage/storage.module';
import { AdminTenantSettingsController } from './admin-tenant-settings.controller';
import { PublicTenantBrandingController } from './public-tenant-branding.controller';
import { TenantSettingsService } from './tenant-settings.service';

@Module({
  imports: [StorageModule],
  controllers: [
    AdminTenantSettingsController,
    PublicTenantBrandingController,
  ],
  providers: [TenantSettingsService],
  exports: [TenantSettingsService],
})
export class TenantSettingsModule {}
