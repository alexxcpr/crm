import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DynamicSchemaService } from 'src/dynamic-schema/dynamic-schema.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateFieldDto, UpdateFieldDto } from '../dto/field.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class AdminFieldsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly dynamicSchema: DynamicSchemaService,
    ){}

    async findAllByEntity(entityId: string){
        await this.ensureEntityExists(entityId);

        return this.prisma.field.findMany({
            where: {
                id_entity: entityId
            },
            orderBy: [
                { group_name: 'asc' },
                { rank: 'asc' }
            ],
            include: {
                relation_entity: {
                    select: {
                        id_entity: true,
                        slug: true,
                        name: true,
                    },
                },
            },
        });
    }

    async findOne(entityId: string, fieldId: string) {
        await this.ensureEntityExists(entityId);

        const field = await this.prisma.field.findFirst({
            where: {
                id_field: fieldId,
                id_entity: entityId,
            },
            include: {
                relation_entity: {
                    select: {
                        id_entity: true,
                        slug: true,
                        name: true,
                    },
                },
            },
        });

        if (!field) {
            throw new NotFoundException(
                `Campul cu id "${fieldId}" nu exista in entitatea "${entityId}".`,
            );
        }

        return field;
    }

    async create(entityId: string, dto: CreateFieldDto){
        const entity = await this.ensureEntityExists(entityId);

        const existingSlug = await this.prisma.field.findUnique({
            where: {
                id_entity_slug: {
                    id_entity: entityId,
                    slug: dto.slug
                },
            },
        });

        if (existingSlug) {
            throw new ConflictException(
                `Slug-ul "${dto.slug}" este deja folosit in aceasta entitate.`,
            );
        }

        if (dto.ui_type === 'relation' && dto.id_relation_entity) {
            const targetEntity = await this.prisma.entity.findUnique({
                where: {
                    id_entity: dto.id_relation_entity
                },
            });
            if (!targetEntity) {
                throw new NotFoundException(
                    `Entitatea tinta pentru relatie cu id "${dto.id_relation_entity}" nu exista.`,
                );
            }
        }

        const columnName = `cf_${dto.slug}`;

        const field = await this.prisma.field.create({
            data: {
                id_entity: entityId,
                name: dto.name,
                slug: dto.slug,
                column_name: columnName,
                data_type: dto.data_type,
                ui_type: dto.ui_type,
                default_value: dto.default_value ?? null,
                placeholder: dto.placeholder ?? null,
                help_text: dto.help_text ?? null,
                options: dto.options ?? undefined,
                is_required: dto.is_required ?? false,
                is_unique: dto.is_unique ?? false,
                is_filterable: dto.is_filterable ?? false,
                is_sortable: dto.is_sortable ?? true,
                visible_in_table: dto.visible_in_table ?? true,
                visible_in_form: dto.visible_in_form ?? true,
                is_system: false,
                validation_rules: dto.validation_rules ?? undefined,
                id_relation_entity: dto.id_relation_entity ?? null,
                relation_display_field: dto.relation_display_field ?? null,
                group_name: dto.group_name ?? 'general',
                rank: dto.rank ?? 1,
                grid_col: dto.grid_col ?? 1,
                col_span: dto.col_span ?? 1,
            },
        });

        try {
            await this.dynamicSchema.addColumn(entity, field);
        } catch (error) {
            await this.prisma.field.delete({ where: { id_field: field.id_field } });
            throw error;
        }

        return field;
    }

    async update(entityId: string, fieldId: string, dto: UpdateFieldDto) {
        await this.ensureEntityExists(entityId);

        const field = await this.prisma.field.findFirst({
            where: {
                id_field: fieldId,
                id_entity: entityId,
            },
        });

        if (!field){
            throw new NotFoundException(
                `Campul cu id "${fieldId}" nu exista in entitatea "${entityId}".`,
            );
        }

        return this.prisma.field.update({
            where: {
                id_field: fieldId,
            },
            data: {
                name: dto.name ?? field.name,
                placeholder: dto.placeholder !== undefined ? dto.placeholder : field.placeholder,
                help_text: dto.help_text !== undefined ? dto.help_text : field.help_text,
                options: dto.options !== undefined ? dto.options : (field.options ?? Prisma.JsonNull),
                is_required: dto.is_required ?? field.is_required,
                is_unique: dto.is_unique ?? field.is_unique,
                is_filterable: dto.is_filterable ?? field.is_filterable,
                is_sortable: dto.is_sortable ?? field.is_sortable,
                visible_in_table: dto.visible_in_table ?? field.visible_in_table,
                visible_in_form: dto.visible_in_form ?? field.visible_in_form,
                validation_rules: dto.validation_rules !== undefined ? dto.validation_rules : (field.validation_rules ?? Prisma.JsonNull),
                group_name: dto.group_name ?? field.group_name,
                rank: dto.rank ?? field.rank,
                grid_col: dto.grid_col ?? field.grid_col,
                col_span: dto.col_span ?? field.col_span,
                default_value: dto.default_value !== undefined ? dto.default_value : field.default_value,
            },
        });
    }

    async remove(entityId: string, fieldId: string){
        const entity = await this.ensureEntityExists(entityId);

        const field = await this.prisma.field.findFirst({
            where: {
                id_field: fieldId,
                id_entity: entityId,
            },
        });

        if (!field){
            throw new NotFoundException(
                `Campul cu id "${fieldId}" nu exista in entitatea "${entityId}".`,
            );
        }

        if (field.is_system) {
            throw new BadRequestException(
                `Campul "${field.name}" este un camp de sistem si nu poate fi sters.`,
            );
        }

        await this.dynamicSchema.removeColumn(entity, field);

        await this.prisma.field.delete({
            where: {
                id_field: fieldId
            },
        });

        return {
            message: `Campul "${field.name}" a fost sters.`
        };
    }

    private async ensureEntityExists(entityId: string) {
        const entity = await this.prisma.entity.findUnique({
            where: { id_entity: entityId },
        });
        if (!entity) {
            throw new NotFoundException(`Entitatea cu id "${entityId}" nu exista.`);
        }
        return entity;
    }
}
