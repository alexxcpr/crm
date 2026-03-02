import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient {
    constructor (config: ConfigService) {
        // 1. Creează un pool de conexiuni native prin pg
        const pool = new Pool ({
            connectionString: config.get('DATABASE_URL'),
        });

        // 2. Leagă pool-ul de adaptorul Prisma
        const adapter = new PrismaPg(pool);

        // 3. Trimite adaptorul către PrismaClient
        super({adapter});
    }
}
