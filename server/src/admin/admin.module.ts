import { Module } from '@nestjs/common';
import { AdminModulesController } from './admin-modules/admin-modules.controller';
import { AdminModulesService } from './admin-modules/admin-modules.service';
import { DynamicSchemaModule } from 'src/dynamic-schema/dynamic-schema.module';
import { AdminEntitiesController } from './admin-entities/admin-entities.controller';
import { AdminFieldsController } from './admin-fields/admin-fields.controller';
import { AdminEntitiesService } from './admin-entities/admin-entities.service';
import { AdminFieldsService } from './admin-fields/admin-fields.service';
import { AdminTabsController } from './admin-tabs/admin-tabs.controller';
import { AdminTabsService } from './admin-tabs/admin-tabs.service';
import { AdminSecurityController } from './admin-security/admin-security.controller';
import { AdminSecurityService } from './admin-security/admin-security.service';

@Module({
  imports: [DynamicSchemaModule],
  controllers: [AdminModulesController, AdminEntitiesController, AdminFieldsController, AdminTabsController, AdminSecurityController],
  providers: [AdminModulesService, AdminEntitiesService, AdminFieldsService, AdminTabsService, AdminSecurityService],
  exports: [AdminModulesService, AdminEntitiesService, AdminFieldsService, AdminTabsService],
})
export class AdminModule {}
