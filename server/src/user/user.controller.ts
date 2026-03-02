import { Controller, UseGuards, Get, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

interface RequestWithUser extends Request {
    user: any;
}

@Controller('user')
export class UserController {

    @UseGuards(AuthGuard('jwt'))
    @Get('me')
    getProfile(@Req() req: RequestWithUser) {
        return req.user;
    }
}
