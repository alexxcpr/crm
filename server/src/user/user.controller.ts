import { Controller, UseGuards, Get, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { User } from '@prisma/client';
import { Request } from 'express';

interface RequestWithUser extends Request {
    user: User;
}

@Controller('user')
@UseGuards(AuthGuard('jwt'))
export class UserController {
    @Get('me')
    getProfile(@Req() req: RequestWithUser) {
        return req.user;
    }
}
