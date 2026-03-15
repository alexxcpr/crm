import { ForbiddenException, Injectable } from "@nestjs/common";
import { AuthDto } from "./dto";
import { PrismaService } from "src/prisma/prisma.service";
import * as argon from 'argon2'
import { Prisma } from "@prisma/client";
import { JwtService } from "@nestjs/jwt";

@Injectable ()
export class AuthService {
    constructor (
        private prisma: PrismaService,
        private jwt: JwtService
    ) {}

    async signup (dto: AuthDto) {
        //generate the password hash
        const hash = await argon.hash(dto.password);
        
        //save the new user in the db
        try {
            const user = await this.prisma.user.create({
                data:{
                    email: dto.email,
                    hash: hash,
                }
            })
    
            // const { hash: _, ...userWithoutHash } = user;
            // // return the saved user
            // return userWithoutHash;
            //return the token
            return this.signToken(user.id, user.email);
        }
        catch (error){
            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                if (error.code === 'P2002'){
                    throw new ForbiddenException('Credentials taken (It already exists a user with these credentials)')
                }
            }
            throw error;
        }
    }
    
    async signin (dto: AuthDto) {
        //primeste email si parola (parametru)
        //cautam userul dupa email
        const user = await this.prisma.user.findUnique({
            where: {
                email: dto.email,
            },
        });
            
        //verificam daca exista un user cu acelasi email
        if (!user){
            throw new ForbiddenException('Credentials incorrect');
        }

        //verificam match parola        
        const pwMatches = await argon.verify(user.hash, dto.password);
        if (!pwMatches){
            throw new ForbiddenException('Credentials incorrect');
        }
        
        // //excludem hash-ul si returnam userul
        // const { hash: _, ...userWithoutHash } = user;
        //     // return the saved user
        //     return userWithoutHash;
        return this.signToken(user.id, user.email);
    }

    private async signToken (userId: string, email: string): Promise<{ accessToken: string }> {
        const payload = {
            sub: userId,
            email: email,
        };

        const token = await this.jwt.signAsync(payload);

        return {
            accessToken: token,
        };
    }
}