import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ModuleDto } from '../dto/module.dto';

@Injectable()
export class AdminModulesService {
    constructor(private readonly prisma:PrismaService){}

    async findAll() {
        return this.prisma.module.findMany({
            orderBy: {
                rank: 'asc'
            },
            include: {
                entities: {
                    orderBy: { rank: 'asc' },
                    select: {
                        id_entity: true,
                        name: true,
                        slug: true,
                        icon: true,
                        label_plural: true,
                        rank: true,
                    },
                },
                _count: {
                    select: {
                        entities: true
                    }
                },
            },
        });
    }

    async findOne(id: string) {
        const mod = await this.prisma.module.findUnique({
            where: {
                id_module: id
            },
            include: {
                entities: {
                    orderBy: {
                        rank: 'asc'
                    },
                    select: {
                        id_entity: true,
                        name: true,
                        slug: true,
                        icon: true,
                        is_system: true,
                        rank: true,
                    },
                },
            },
        });

        if (!mod) {
            throw new NotFoundException(`Modului cu id "${id}" nu exista.`);
        }

        return mod;
    }

    async create(dto: ModuleDto) {
        const existing = await this.prisma.module.findUnique({
            where: {
                slug: dto.slug,
            }
        });

        if (existing){
            throw new ConflictException(`Slug-ul "${dto.slug}" este deja folosit.`);
        }

        return this.prisma.module.create({
            data: {
                name: dto.name,
                slug: dto.slug,
                icon: dto.icon ?? null,
                rank: dto.rank ?? 0,
                is_active: dto.is_active ?? true,
            },
        });
    }

    async update(id: string, dto: ModuleDto) {
        const mod = await this.prisma.module.findUnique({
            where: {
                id_module: id
            },
        });

        if (!mod) {
            throw new NotFoundException(`Modulul cu id "${id}" nu exista.`);
        }

        const slugConflict = await this.prisma.module.findFirst({
            where: {
                slug: dto.slug,
                id_module: {
                    not: id
                },
            },
        });

        if (slugConflict) {
            throw new ConflictException(`Slug-ul "${dto.slug}" este deja folosit de alt modul.`);
        }

        return this.prisma.module.update({
            where: {
                id_module: id
            },
            data: {
                name: dto.name,
                slug: dto.slug,
                icon: dto.icon ?? null,
                rank: dto.rank ?? 0,
                is_active: dto.is_active ?? true,
            },
        });
    }

    async remove(id: string) {
        const mod = await this.prisma.module.findUnique({
            where: {
                id_module: id
            },
            include: {
                _count: {
                    select: {
                        entities: true
                    }
                },
            },
        });

        if (!mod) {
            throw new NotFoundException(`Modulul cu id "${id}" nu exista.`);
        }

        if (mod._count.entities > 0){
            throw new BadRequestException(
                `Modulul "${mod.name}" contine ${mod._count.entities} entitati. Muta sau sterge entitatile inainte.`,
            );
        }

        await this.prisma.module.delete({
            where: {
                id_module: id
            }
        });

        return {
            message: `Modulul "${mod.name}" a fost sters.`
        };
    }
}
