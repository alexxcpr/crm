import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import knex, { Knex } from 'knex'

@Injectable()
export class KnexService {
    public readonly instance: Knex;

    constructor(config: ConfigService){
        this.instance = knex ({
            client: 'pg',
            connection: config.get('DATABASE_URL'),
        });
    }
}
