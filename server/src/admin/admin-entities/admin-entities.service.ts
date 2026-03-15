import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DynamicSchemaService } from 'src/dynamic-schema/dynamic-schema.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateEntityDto, UpdateEntityDto } from '../dto/entity.dto';

@Injectable()
export class AdminEntitiesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly dynamicSchema: DynamicSchemaService,
    ){}

    async findAll(moduleId?: string){
        const where: any = {};
        if (moduleId){
            where.id_module = moduleId;
        }

        return this.prisma.entity.findMany({
            where,
            orderBy: {
                rank: 'asc'
            },
            include: {
                module: {
                    select: {
                        id_module: true,
                        name: true,
                        slug: true,
                    },
                },
                _count: {
                    select: {
                        fields: true
                    },
                },
            },
        });
    }

    async findOne(id: string) {
        const entity = await this.prisma.entity.findUnique({
            where: {
                id_entity: id
            },
            include: {
                module: {
                    select: {
                        id_module: true,
                        name: true,
                        slug: true,
                    },
                },
                fields: {
                    orderBy: [
                        { group_name: 'asc' },
                        { rank: 'asc' }, 
                    ],
                },
            },
        });

        if (!entity){
            throw new NotFoundException(`Entitatea cu id "${id}" nu exista.`);
        }

        return entity;
    }

    async create(dto: CreateEntityDto) {
        const existing = await this.prisma.entity.findUnique({
            where: {
                slug: dto.slug
            },
        });

        if (existing){
            throw new ConflictException(`Slug-ul "${dto.slug}" este deja folosit de o alta entitate.`);
        }

        if (dto.id_module) {
            const moduleExists = await this.prisma.module.findUnique({
                where: {
                    id_module: dto.id_module
                },
            });
            if (!moduleExists){
                throw new NotFoundException(`Modului cu id "${dto.id_module}" nu exista.`);
            }
        }

        const tableName = `ent_${dto.slug}`;

        const entity = await this.prisma.entity.create({
            data: {
                name: dto.name,
                slug: dto.slug,
                table_name: tableName,
                id_module: dto.id_module,
                icon: dto.icon,
                label_singular: dto.label_singular,
                label_plural: dto.label_plural,
                rank: dto.rank ?? 0,
                is_system: false
            },
        });

        await this.dynamicSchema.createEntityTable(entity);

        return entity;
    }

    async update(id: string, dto: UpdateEntityDto){
        const entity = await this.prisma.entity.findUnique({
            where: {
                id_entity: id,
            },
        });

        if(!entity){
            throw new NotFoundException(`Entitatea cu id "${id}" nu exista.`);
        }

        return this.prisma.entity.update({
            where: {
                id_entity: id
            },
            data: {
                name: dto.name ?? entity.name,
                id_module: dto.id_module !== undefined ? dto.id_module : entity.id_module,
                icon: dto.icon !== undefined ? dto.icon : entity.icon,
                label_singular: dto.label_singular !== undefined ? dto.label_singular : entity.label_singular,
                label_plural: dto.label_plural !== undefined ? dto.label_plural : entity.label_plural,
                rank: dto.rank ?? entity.rank,
            },
        });
    }

    async remove (id: string) {
        const entity = await this.prisma.entity.findUnique({
            where: {
                id_entity: id
            },
            include: {
                _count: {
                    select: {
                        fields: true
                    },
                },
            },
        });

        if (!entity){
            throw new NotFoundException(`Entitatea cu id "${id}" nu exista.`);
        }

        if (entity.is_system) {
            throw new BadRequestException(
                `Entitatea "${entity.name}" este o entitate de sistem si nu poate fi stearsa.`,
            );
        }

        await this.prisma.entity.delete({
            where: {
                id_entity: id
            },
        });

        return {
            message: `Entitatea "${entity.name}" a fost stearsa cu succes.`
        };
    }
}
