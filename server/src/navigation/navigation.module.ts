import { Module } from '@nestjs/common';
import { NavigationMenuController } from './navigation-menu.controller';
import { NavigationMenuService } from './navigation-menu.service';
import { DashboardModule } from 'src/dashboards/dashboard.module';
import { CalendarModule } from 'src/calendars/calendar.module';

@Module({
  imports: [DashboardModule, CalendarModule],
  controllers: [NavigationMenuController],
  providers: [NavigationMenuService],
})
export class NavigationModule {}
