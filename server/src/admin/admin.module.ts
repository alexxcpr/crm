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
import { AdminMenusController } from './admin-menus/admin-menus.controller';
import { AdminMenusService } from './admin-menus/admin-menus.service';

@Module({
  imports: [DynamicSchemaModule],
  controllers: [AdminModulesController, AdminEntitiesController, AdminFieldsController, AdminTabsController, AdminSecurityController, AdminMenusController],
  providers: [AdminModulesService, AdminEntitiesService, AdminFieldsService, AdminTabsService, AdminSecurityService, AdminMenusService],
  exports: [AdminModulesService, AdminEntitiesService, AdminFieldsService, AdminTabsService, AdminMenusService],
})
export class AdminModule {}
