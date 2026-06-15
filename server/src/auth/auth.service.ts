import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
    private readonly config: ConfigService,
  ) {}

  async signup(_dto: AuthDto) {
    if (!this.config.get<boolean>('PUBLIC_SIGNUP_ENABLED', false)) {
      throw new ForbiddenException('Inregistrarea publica este dezactivata.');
    }
    throw new ForbiddenException('Conturile sunt create de administrator.');
  }

  async signin(dto: AuthDto) {
    const knex = this.tenantContext.knex;
    const loginUsername = dto.loginUsername.trim().toLowerCase();
    const user = await knex('user').whereRaw('LOWER(login_username) = ?', [loginUsername]).first();
    if (!user || !user.is_active || !(await argon.verify(user.hash, dto.password))) {
      throw new ForbiddenException('Credentiale incorecte');
    }
    const profile = await knex('profile')
      .where({ id_user: user.id, is_active: true })
      .orderBy([{ column: 'is_default', order: 'desc' }, { column: 'date_created', order: 'asc' }])
      .first();
    if (!profile) throw new ForbiddenException('Contul nu are niciun profil activ.');
    return this.signToken(user.id, profile.id_profile);
  }

  async refreshToken(refreshToken: string) {
    const knex = this.tenantContext.knex;
    let payload: { sub: string; profileId: string; jti: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken);
    } catch {
      throw new UnauthorizedException('Refresh token invalid sau expirat');
    }
    const stored = await knex('refresh_token')
      .where({ jti: payload.jti, user_id: payload.sub, profile_id: payload.profileId, is_revoked: false })
      .where('expires_at', '>', knex.fn.now())
      .first();
    const profile = await knex('profile').where({ id_profile: payload.profileId, id_user: payload.sub, is_active: true }).first();
    if (!stored || !profile) throw new UnauthorizedException('Sesiunea a fost revocata.');
    await knex('refresh_token').where('jti', payload.jti).update({ is_revoked: true });
    return this.signToken(payload.sub, payload.profileId);
  }

  async switchProfile(userId: string, profileId: string, refreshToken?: string) {
    const profile = await this.tenantContext.knex('profile')
      .where({ id_profile: profileId, id_user: userId, is_active: true })
      .first();
    if (!profile) throw new ForbiddenException('Profilul nu apartine contului sau este inactiv.');
    if (refreshToken) await this.revokeToken(refreshToken);
    return this.signToken(userId, profileId);
  }

  async signout(refreshToken: string) {
    if (refreshToken) await this.revokeToken(refreshToken);
    return { message: 'Deconectare reusita' };
  }

  private async revokeToken(token: string): Promise<void> {
    try {
      const payload = await this.jwt.verifyAsync(token);
      await this.tenantContext.knex('refresh_token').where('jti', payload.jti).update({ is_revoked: true });
    } catch {
      // Tokenul invalid este deja inutilizabil.
    }
  }

  private async signToken(userId: string, profileId: string) {
    const payload = { sub: userId, profileId, tenant: this.tenantContext.slug, dbName: this.tenantContext.dbName };
    const accessToken = await this.jwt.signAsync(payload);
    const jti = randomUUID();
    const refreshToken = await this.jwt.signAsync({ ...payload, jti }, { expiresIn: '1d' });
    await this.tenantContext.knex('refresh_token').insert({
      jti,
      user_id: userId,
      profile_id: profileId,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    return { accessToken, refreshToken };
  }
}
