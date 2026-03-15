import { Module } from "@nestjs/common";
import { AdminModulesController } from "./admin-modules/admin-modules.controller";
import { AdminModulesService } from "./admin-modules/admin-modules.service";
import { DynamicSchemaModule } from "src/dynamic-schema/dynamic-schema.module";
import { AdminEntitiesController } from "./admin-entities/admin-entities.controller";
import { AdminFieldsController } from "./admin-fields/admin-fields.controller";
import { AdminEntitiesService } from "./admin-entities/admin-entities.service";
import { AdminFieldsService } from "./admin-fields/admin-fields.service";

@Module({
    imports: [DynamicSchemaModule],
    controllers: [AdminModulesController, AdminEntitiesController, AdminFieldsController],
    providers: [AdminModulesService, AdminEntitiesService, AdminFieldsService],
    exports: [AdminModulesService, AdminEntitiesService, AdminFieldsService],
})
export class AdminModule {}