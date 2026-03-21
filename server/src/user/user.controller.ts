import { Controller, UseGuards, Get, Req, Param, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { User } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from 'src/prisma/prisma.service';

interface RequestWithUser extends Request {
    user: User;
}

@Controller('user')
@UseGuards(AuthGuard('jwt'))
export class UserController {
    constructor(private readonly prisma: PrismaService) {}
    
    @Get('me')
    getProfile(@Req() req: RequestWithUser) {
        return req.user;
    }

    @Get(':id')
    async getUserById(@Param('id') id: string) {
    const user = await this.prisma.user.findUnique({
        where: { id },
        select: { id: true, email: true, first_name: true, last_name: true }
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
    }
}
