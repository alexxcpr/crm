import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Entity, Field} from '@prisma/client';
import { KnexService } from 'src/knex/knex.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { applyColumn, ColumnDefinition } from './data-type.mapper';

const SLUG_REGEX = /^[a-z][a-z0-9_]{1,50}$/;

@Injectable()
export class DynamicSchemaService {

    private readonly logger = new Logger(DynamicSchemaService.name)

    constructor(
        private readonly knex: KnexService,
        private readonly prisma: PrismaService,
    ) {}

    // ─── 1. Creeaza tabela dinamica pentru o entitate (din informatiile din prisma, tabel Entity, generic, doar scheletele) ───
    async createEntityTable(entity: Entity): Promise<void> {
        const tableName = entity.table_name;

        const exists = await this.knex.instance.schema.hasTable(tableName);
        if (exists) {
            this.logger.warn(`Tabela "${tableName}" exista deja, skip.`);
            return;
        }

        await this.knex.instance.schema.createTable(tableName, (table) => {
            table.uuid('id').primary().defaultTo(this.knex.instance.fn.uuid());
            table.timestamp('date_created', { useTz: true }).notNullable().defaultTo(this.knex.instance.fn.now());
            table.timestamp('date_updated', { useTz: true }).notNullable().defaultTo(this.knex.instance.fn.now());
            table.uuid('id_owner').nullable();
            table.jsonb('extra_data').defaultTo('{}');
        });

        this.logger.log(`Tabela "${tableName}" a fost creata cu succes.`);
    }

    // ─── 2. Adaugă o coloană pe o tabelă existentă ───
    async addColumn(entity: Entity, field: Field): Promise<void> {
        //validare slug (doar litere mici, cifre, underline, 2-51 caractere, sa nu inceapa cu cifra sau underline)
        this.validateSlug(field.slug);
        const tableName = entity.table_name;

        //verifica daca exista coloana
        const hasColumn = await this.knex.instance.schema.hasColumn(tableName, field.column_name);
        if (hasColumn) {
            this.logger.warn(`Coloana "${field.column_name}" exista deja in "${tableName}", skip`);
            return;
        }

        //face modificarea in db (alter table)
        await this.knex.instance.schema.alterTable(tableName, (table) => {
            const colDef: ColumnDefinition = {
                columnName: field.column_name,
                dataType: field.data_type,
                isRequired: field.is_required,
                isUnique: field.is_unique,
                defaultValue: field.default_value,
            };

            applyColumn(table, colDef);

            //FK pentru campuri de tip relatie
            if (field.ui_type === 'relation' && field.id_relation_entity) {
                this.addForeignKeyAsync(tableName, field);
            }
        });

        // Index automat pe campuri filterable
        if (field.is_filterable) {
            await this.createIndex(tableName, field.column_name);
        }

        this.logger.log(`Coloana "${field.column_name}" a fost adaugata in "${tableName}".`);
    }

    // ─── 3. Șterge o coloană ───
    async removeColumn(entity: Entity, field: Field) :Promise<void> {
        if (field.is_system) {
            throw new BadRequestException(
                `Campul "${field.name}" este proprietate de system si nu poate fi sters.`
            );
        }

        const tableName = entity.table_name;

        await this.knex.instance.schema.alterTable(tableName, (table) => {
            table.dropColumn(field.column_name);
        });

        this.logger.log(`Coloana "${field.column_name}" a fost stearsa din "${tableName}".`);
    }

    // ─── 4. Creează index B-Tree ───
    async createIndex(tableName: string, columnName: string): Promise<void> {
        const indexName = `idx_${tableName}_${columnName}`;

        try {
            await this.knex.instance.schema.alterTable(tableName, (table) => {
                table.index(columnName, indexName);
            });
            this.logger.log(`Index "${indexName}" creat.`);
        } 
        catch (error: any) {
            if (error.messages?.includes('already exists')) {
                this.logger.warn(`Index "${indexName}" exista deja, skip.`);
            }
            else {
                throw error;
            }
        }
    }

    // ─── 5. Populează coloanele sistem dintr-o entitate (bulk) ───
    // Folosit de seed sau de admin la crearea unei entități noi cu câmpuri predefinite
    async addColumnsFromFieldDefinitions(entity: Entity): Promise<void> {
        const fields = await this.prisma.field.findMany({
            where: {
                id_entity: entity.id_entity
            },
            orderBy: {
                rank: 'asc'
            },
        });

        for (const field of fields) {
            await this.addColumn(entity, field);
        }
    }

    // ─── Helpers privat ───
    private validateSlug(slug: string): void {
        if (!SLUG_REGEX.test(slug)) {
            throw new BadRequestException(
                `Slug-ul "${slug}" este invalid.Trebuie sa respecte regulile de slug: Litere mici, separarea se face prin underscore ("_"), cifre si intre 2-51 caractere`,
            );
        }
    }

    private async addForeignKeyAsync(tableName: string, field: Field): Promise<void> {
        if (!field.id_relation_entity) return;

        const targetEntity = await this.prisma.entity.findUnique({
            where: {
                id_entity: field.id_relation_entity
            },
        });

        if (!targetEntity) {
            this.logger.warn(`Entitatea tinta pentru FK nu a fost gasita: ${field.id_relation_entity}`);
            return;
        }

        await this.knex.instance.schema.alterTable(tableName, (table) => {
            table.foreign(field.column_name).references('id').inTable(targetEntity.table_name);
        })
    }
}
