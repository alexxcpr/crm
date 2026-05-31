import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon from 'argon2';
import { randomUUID } from 'crypto';
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

  async refreshToken(refreshToken: string) {
    const knex = this.tenantContext.knex;

    let payload: { sub: string; jti: string; email: string; tenant: string; dbName: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const stored = await knex('refresh_token')
      .where('jti', payload.jti)
      .where('is_revoked', false)
      .where('expires_at', '>', knex.fn.now())
      .first();

    if (!stored) {
      throw new UnauthorizedException('Refresh token has been revoked or expired');
    }

    // Token rotation: revoke old token, issue new one
    await knex('refresh_token').where('jti', payload.jti).update({ is_revoked: true });

    return this.signToken(payload.sub, payload.email);
  }

  async signout(refreshToken: string) {
    const knex = this.tenantContext.knex;

    try {
      const payload = await this.jwt.verifyAsync(refreshToken);
      await knex('refresh_token').where('jti', payload.jti).update({ is_revoked: true });
    } catch {
      // Token invalid or expired — nothing to revoke
    }

    return { message: 'Logged out successfully' };
  }

  private async signToken(userId: string, email: string): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = {
      sub: userId,
      email,
      tenant: this.tenantContext.slug,
      dbName: this.tenantContext.dbName,
    };

    const accessToken = await this.jwt.signAsync(payload);

    // Refresh token: includes jti for revocation tracking, expires in 1 day
    const jti = randomUUID();
    const refreshToken = await this.jwt.signAsync(
      { ...payload, jti },
      { expiresIn: '1d' },
    );

    const knex = this.tenantContext.knex;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await knex('refresh_token').insert({
      jti,
      user_id: userId,
      expires_at: expiresAt,
    });

    return { accessToken, refreshToken };
  }
}
