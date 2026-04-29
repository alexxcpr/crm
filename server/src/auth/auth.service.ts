import { ForbiddenException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon from 'argon2';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { AuthDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly jwt: JwtService,
  ) {}

  async signup(dto: AuthDto) {
    const knex = this.tenantContext.knex;
    const hash = await argon.hash(dto.password);

    const existing = await knex('user').where('email', dto.email).first();
    if (existing) {
      throw new ForbiddenException('Credentials taken (It already exists a user with these credentials)');
    }

    const [user] = await knex('user')
      .insert({ email: dto.email, hash })
      .returning(['id', 'email']);

    return this.signToken(user.id, user.email);
  }

  async signin(dto: AuthDto) {
    const knex = this.tenantContext.knex;

    const user = await knex('user').where('email', dto.email).first();
    if (!user) {
      throw new ForbiddenException('Credentials incorrect');
    }

    const pwMatches = await argon.verify(user.hash, dto.password);
    if (!pwMatches) {
      throw new ForbiddenException('Credentials incorrect');
    }

    return this.signToken(user.id, user.email);
  }

  private async signToken(userId: string, email: string): Promise<{ accessToken: string }> {
    const payload = {
      sub: userId,
      email,
      tenant: this.tenantContext.slug,
      dbName: this.tenantContext.dbName,
    };

    const token = await this.jwt.signAsync(payload);
    return { accessToken: token };
  }
}
