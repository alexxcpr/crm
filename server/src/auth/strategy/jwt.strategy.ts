import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
    constructor (
        config: ConfigService,
        private prisma: PrismaService,
    ) {
        super({
            //extrage tokenul din header
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            //verifica semnatura folosind secretul
            secretOrKey: config.get<string>('JWT_SECRET') as string,
        });
    }

    // Daca token-ul este valid, Passport apeleaza automat aceasta functie
    // cu payload-ul decriptat (cel creat de noi: { sub: userId, email: email })
    async validate (payload : {sub: string, email: string}) {
        const user = await this.prisma.user.findUnique({
            where: {
                id: payload.sub,
            },
        });

        if (!user) {
            throw new UnauthorizedException();
        }

        const { hash: _, ...userWithoutHash } = user;
        // return the saved user
        return userWithoutHash;
    }
}