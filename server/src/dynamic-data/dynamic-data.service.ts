import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Entity, Prisma } from '@prisma/client';
import { KnexService } from 'src/knex/knex.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { FilterParserService } from './filter-parser.service';
import { DynamicValidationService } from './dynamic-validation.service';
import { PaginatedResponse } from './dto/query.dto';

export type FieldWithRelation = Prisma.FieldGetPayload<{
    include: { relation_entity: true }
}>;

@Injectable()
export class DynamicDataService {
    private readonly logger = new Logger(DynamicDataService.name);

    constructor (
        private readonly prisma: PrismaService,
        private readonly knex: KnexService,
        private readonly filterParser: FilterParserService,
        private readonly validation: DynamicValidationService
    ) {}

    // ─── Helper: incarca entity + fields din Prisma ───
    private async resolveEntity(entitySlug: string): Promise<{ entity: Entity; fields: FieldWithRelation[] }> {
        //cauta entitatea(metadata din Prisma)
        const entity = await this.prisma.entity.findUnique({
            where: {
                slug: entitySlug
            },
        })

        if (!entity){
            throw new NotFoundException(`Entitatea "${entitySlug}" nu exista.`);
        }

        //cauta campurile entitatii (metadata din Prisma)
        const fields = await this.prisma.field.findMany({
            where:{
                id_entity: entity.id_entity
            },
            include: {
                relation_entity: true
            },
            orderBy: {
                rank: 'asc'
            },
        });

        return {entity, fields};
    }


    // ─── GET lista cu paginare + filtre + sortare ───
    async findAll(entitySlug: string, query: Record<string, any>): Promise<PaginatedResponse<Record<string,any>>> {
        // console.log('QUERY RAW:', JSON.stringify(query, null, 2));
        const { entity, fields } = await this.resolveEntity(entitySlug);
        const tableName = entity.table_name;

        //Paginarea
        const page = Math.max(1, parseInt(query.page) || 1);
        const limit = Math.min(100, Math.max(25, parseInt(query.limit) || 25));
        const offset = (page - 1) * limit;

        // Coloane selectate: sistem + din field_definitions
        const systemColumns = ['id', 'date_created', 'date_updated', 'id_owner'];
        const selectColumns: any[] = [
            ...systemColumns.map(c => `${tableName}.${c}`),
            ...fields.filter(f => f.visible_in_table).map(f => `${tableName}.${f.column_name}`)
        ];

        // Query principal
        let dataQuery = this.knex.instance(tableName);

        // Adaugam join-uri pentru campurile relationale pentru a aduce display field-ul
        const relationFields = fields.filter(f => f.ui_type === 'relation' && f.visible_in_table && f.relation_entity);
        for (const field of relationFields) {
            if (!field.relation_entity) continue;
            const relTableName = field.relation_entity.table_name;
            const alias = `rel_${field.column_name}`;
            
            dataQuery = dataQuery.leftJoin(
                `${relTableName} as ${alias}`,
                `${tableName}.${field.column_name}`,
                `${alias}.id`
            );
            
            if (field.relation_display_field) {
                selectColumns.push(`${alias}.${field.relation_display_field} as ${field.column_name}_display`);
            }
        }

        dataQuery = dataQuery.select(selectColumns);

        // Aplica filtre
        const filters = this.filterParser.parse(query, fields, tableName);
        for (const filter of filters) {
            dataQuery = this.filterParser.apply(dataQuery, filter);
        }

        // Aplica sortare
        if (query.sort) {
            const sortFields = (query.sort as string).split(',');
            const orderBy = sortFields.map(s => {
                const desc = s.startsWith('-');
                const column = desc ? s.substring(1) : s;
                // Verifica ca coloana exista (securitate)
                const valid = fields.some(f => f.column_name === column || f.slug === column)
                    || systemColumns.includes(column);
                if (!valid) return null;
                //Daca e slug, translateaza in column_name
                const field = fields.find(f => f.slug === column);
                const realColumn = field ? field.column_name : column;
                return { column: `${tableName}.${realColumn}`, order: desc ? 'desc' : 'asc'};
            }).filter(Boolean);

            if (orderBy.length > 0) {
                dataQuery = dataQuery.orderBy(orderBy as any);
            }
        }
        else {
            dataQuery = dataQuery.orderBy(`${tableName}.date_created`, 'desc');
        }

        // Count total (inainte de limit/offset)
        let countQuery = this.knex.instance(tableName).count(`${tableName}.id as total`);
        for (const filter of filters) {
            countQuery = this.filterParser.apply(countQuery, filter);
        }

        // Aplica paginare
        dataQuery = dataQuery.limit(limit).offset(offset);

        // Executa ambele query-uri
        const [data, [{ total }]] = await Promise.all([
            dataQuery,
            countQuery,
        ]);

        const totalNum = Number(total);

        return {
            data,
            meta: {
                total: totalNum,
                page,
                limit,
                totalPages: Math.ceil(totalNum / limit),
            },
        };
    }

    // ─── GET un singur record ───
    async findOne(entitySlug: string, id: string) {
        const { entity, fields } = await this.resolveEntity(entitySlug);
        const tableName = entity.table_name;

        const systemColumns = ['id', 'date_created', 'date_updated', 'id_owner'];
        const selectColumns: any[] = [
            ...systemColumns.map(c => `${tableName}.${c}`),
            ...fields.map(f => `${tableName}.${f.column_name}`)
        ];

        let dataQuery = this.knex.instance(tableName);

        const relationFields = fields.filter(f => f.ui_type === 'relation' && f.relation_entity);
        for (const field of relationFields) {
            if (!field.relation_entity) continue;
            const relTableName = field.relation_entity.table_name;
            const alias = `rel_${field.column_name}`;
            
            dataQuery = dataQuery.leftJoin(
                `${relTableName} as ${alias}`,
                `${tableName}.${field.column_name}`,
                `${alias}.id`
            );
            
            if (field.relation_display_field) {
                selectColumns.push(`${alias}.${field.relation_display_field} as ${field.column_name}_display`);
            }
        }

        const record = await dataQuery
            .select(selectColumns)
            .where(`${tableName}.id`, id)
            .first();

        if (!record) {
            throw new NotFoundException(`Inregistrarea cu id "${id}}" nu a fost gasita in "${entitySlug}".`);
        }

        // După ce obții record-ul
        if (record.id_owner) {
            const owner = await this.knex.instance('user')
            .select('email', 'first_name', 'last_name')
            .where('id', record.id_owner)
            .first();
            record.owner_email = owner?.email || null;
            record.owner_name = owner ? `${owner.first_name} ${owner.last_name}` : null;
        }

        return { data: record };
    }

    // ─── POST creare record ───
    async create(entitySlug: string, body: Record<string, any>, userId?: string) {
        const { entity, fields } = await this.resolveEntity(entitySlug);

        // Valideaza si sanitizeaza body
        const sanitized = await this.validation.validateAndSanitize(
            body, fields, entity.table_name, 'create', undefined,  
        );

        const insertData: Record<string, any> = {
            ...sanitized,
            date_created: new Date(),
            date_updated: new Date(),
        };

        // Seteaza id_owner daca este furnizat
        if (userId) {
            insertData.id_owner = userId;
        }

        const [record] = await this.knex.instance(entity.table_name)
            .insert(insertData)
            .returning('*');

        return { data: record };
    }

    // ─── PUT update record ───
    async update(entitySlug: string, id: string, body: Record<string, any>) {
        const { entity, fields } = await this.resolveEntity(entitySlug);

        // Verifica ca exista
        const exists = await this.knex.instance(entity.table_name)
            .where('id', id)
            .first();

        if (!exists) {
            throw new NotFoundException(`Inregistrarea cu id "${id}" nu a fost gasita in "${entitySlug}".`);
        }

        // Valideaza (mode 'update' = campurile required nu sunt obligatorii daca nu sunt trimise)
        const sanitized = await this.validation.validateAndSanitize(
            body, fields, entity.table_name, 'update', id
        );

        const [record] = await this.knex.instance(entity.table_name)
            .where('id', id)
            .update({
                ...sanitized,
                date_updated: new Date(),
            })
            .returning('*');

        return { data: record };
    }

    // ─── DELETE sterge record ───
    async remove(entitySlug: string, id: string) {
        const { entity } = await this.resolveEntity(entitySlug);

        const deleted = await this.knex.instance(entity.table_name)
            .where('id', id)
            .del();

        if (deleted === 0) {
            throw new NotFoundException(`Inregistrarea cu id "${id}" nu a fost gasita in "${entitySlug}".`);
        }
    }
}
