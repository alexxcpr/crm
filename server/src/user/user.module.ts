import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { BillingModule } from 'src/billing/billing.module';

@Module({
  imports: [BillingModule],
  controllers: [UserController],
})
export class UserModule {}
