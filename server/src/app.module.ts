import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { PrismaModule } from './prisma/prisma.module';
import { ContactsModule } from './contacts/contacts.module';
import { KnexModule } from './knex/knex.module';
import { DynamicSchemaModule } from './dynamic-schema/dynamic-schema.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal:true,
    }),
    AuthModule, UserModule, PrismaModule, ContactsModule, KnexModule, DynamicSchemaModule],
  providers: [],
  controllers: [],
})
export class AppModule {}
