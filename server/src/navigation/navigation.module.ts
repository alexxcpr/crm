import { Module } from '@nestjs/common';
import { NavigationMenuController } from './navigation-menu.controller';
import { NavigationMenuService } from './navigation-menu.service';
import { DashboardModule } from 'src/dashboards/dashboard.module';

@Module({
  imports: [DashboardModule],
  controllers: [NavigationMenuController],
  providers: [NavigationMenuService],
})
export class NavigationModule {}
