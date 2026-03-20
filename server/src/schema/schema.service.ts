import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SchemaService {
    constructor(private readonly prisma: PrismaService) {}

    async getEntitySchema(entitySlug: string) {
        const entity = await this.prisma.entity.findUnique({
            where: {
                slug: entitySlug
            },
            include: {
                fields: {
                    include: {
                        relation_entity: {
                            select: {
                                slug: true
                            },
                        },
                    },
                    orderBy: [
                        { group_name: 'asc'},
                        { rank: 'asc' },
                    ],
                },
            }
        })

        if (!entity) {
            throw new NotFoundException(`Entitatea "${entitySlug}" nu exista.`);
        }

        const groups = [...new Set(entity.fields.map(f => f.group_name))];

        return {
            entity: {
                id_entity: entity.id_entity,
                slug: entity.slug,
                name: entity.name,
                table_name: entity.table_name,
                label_singular: entity.label_singular,
                label_plural: entity.label_plural,
                icon: entity.icon,
                is_system: entity.is_system,
                module: entity.id_module,
            },
            fields: entity.fields.map(f => ({
                id_field: f.id_field,
                slug: f.slug,
                name: f.name,
                column_name: f.column_name,
                data_type: f.data_type,
                ui_type: f.ui_type,
                default_value: f.default_value,
                placeholder: f.placeholder,
                help_text: f.help_text,
                options: f.options,
                is_required: f.is_required,
                is_unique: f.is_unique,
                is_filterable: f.is_filterable,
                is_sortable: f.is_sortable,
                visible_in_table: f.visible_in_table,
                visible_in_form: f.visible_in_form,
                is_system: f.is_system,
                validation_rules: f.validation_rules,
                id_relation_entity: f.id_relation_entity,
                relation_display_field: f.relation_display_field,
                relation_entity_slug: f.relation_entity?.slug ?? null,
                group_name: f.group_name,
                rank: f.rank,
                grid_col: f.grid_col,
                col_span: f.col_span,
            })),
            groups,
        };
    }

}
