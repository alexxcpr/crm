import { Module } from '@nestjs/common';
import { NavigationMenuController } from './navigation-menu.controller';
import { NavigationMenuService } from './navigation-menu.service';

@Module({
  controllers: [NavigationMenuController],
  providers: [NavigationMenuService],
})
export class NavigationModule {}
