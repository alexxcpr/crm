import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon from 'argon2';
import { randomUUID } from 'crypto';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { AuthDto } from './dto';

const ACCESS_TOKEN_TTL_SECONDS = 30 * 60;
const SESSION_TTL_SECONDS = 24 * 60 * 60;

interface RefreshPayload {
  sub: string;
  profileId: string;
  jti: string;
  sessionExp?: number;
  exp?: number;
}

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
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync(refreshToken);
    } catch {
      throw new UnauthorizedException('Refresh token invalid sau expirat');
    }
    const sessionExp = this.resolveSessionExpiry(payload);
    if (sessionExp <= this.nowSeconds()) {
      throw new UnauthorizedException('Sesiunea a expirat.');
    }

    return knex.transaction(async (trx) => {
      const stored = await trx('refresh_token')
        .where({ jti: payload.jti, user_id: payload.sub, profile_id: payload.profileId, is_revoked: false })
        .where('expires_at', '>', trx.fn.now())
        .forUpdate()
        .first();
      const profile = await trx('profile')
        .where({ id_profile: payload.profileId, id_user: payload.sub, is_active: true })
        .first();
      if (!stored || !profile) throw new UnauthorizedException('Sesiunea a fost revocata.');
      await trx('refresh_token').where('jti', payload.jti).update({ is_revoked: true });
      return this.signToken(payload.sub, payload.profileId, sessionExp, trx);
    });
  }

  async switchProfile(
    userId: string,
    profileId: string,
    refreshToken?: string,
    accessSessionExp?: number,
  ) {
    let sessionExp = accessSessionExp;
    if (refreshToken) {
      let payload: RefreshPayload;
      try {
        payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken);
        if (payload.sub !== userId) throw new Error('Token user mismatch');
        sessionExp = this.resolveSessionExpiry(payload);
      } catch {
        throw new UnauthorizedException('Refresh token invalid sau expirat');
      }
      if (sessionExp <= this.nowSeconds()) {
        throw new UnauthorizedException('Sesiunea a expirat.');
      }

      return this.tenantContext.knex.transaction(async (trx) => {
        const stored = await trx('refresh_token')
          .where({ jti: payload.jti, user_id: userId, profile_id: payload.profileId, is_revoked: false })
          .where('expires_at', '>', trx.fn.now())
          .forUpdate()
          .first();
        if (!stored) throw new UnauthorizedException('Sesiunea a fost revocata.');
        const profile = await trx('profile')
          .where({ id_profile: profileId, id_user: userId, is_active: true })
          .first();
        if (!profile) throw new ForbiddenException('Profilul nu apartine contului sau este inactiv.');
        await trx('refresh_token').where('jti', payload.jti).update({ is_revoked: true });
        return this.signToken(userId, profileId, sessionExp, trx);
      });
    }

    const profile = await this.tenantContext.knex('profile')
      .where({ id_profile: profileId, id_user: userId, is_active: true })
      .first();
    if (!profile) throw new ForbiddenException('Profilul nu apartine contului sau este inactiv.');
    return this.signToken(userId, profileId, sessionExp);
  }

  async signout(refreshToken: string) {
    if (refreshToken) await this.revokeToken(refreshToken, true);
    return { message: 'Deconectare reusita' };
  }

  private async revokeToken(token: string, allForProfile = false): Promise<void> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshPayload>(token);
      const query = this.tenantContext.knex('refresh_token');
      if (allForProfile) {
        await query
          .where({ user_id: payload.sub, profile_id: payload.profileId })
          .update({ is_revoked: true });
      } else {
        await query.where('jti', payload.jti).update({ is_revoked: true });
      }
    } catch {
      // Tokenul invalid este deja inutilizabil.
    }
  }

  private async signToken(
    userId: string,
    profileId: string,
    existingSessionExp?: number,
    database = this.tenantContext.knex,
  ) {
    const now = this.nowSeconds();
    const sessionExp = existingSessionExp ?? now + SESSION_TTL_SECONDS;
    const remainingSessionSeconds = sessionExp - now;
    if (remainingSessionSeconds <= 0) {
      throw new UnauthorizedException('Sesiunea a expirat.');
    }
    const payload = {
      sub: userId,
      profileId,
      tenant: this.tenantContext.slug,
      dbName: this.tenantContext.dbName,
      sessionExp,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: Math.min(ACCESS_TOKEN_TTL_SECONDS, remainingSessionSeconds),
    });
    const jti = randomUUID();
    const refreshToken = await this.jwt.signAsync(
      { ...payload, jti },
      { expiresIn: remainingSessionSeconds },
    );
    await database('refresh_token').insert({
      jti,
      user_id: userId,
      profile_id: profileId,
      expires_at: new Date(sessionExp * 1000),
    });
    return { accessToken, refreshToken };
  }

  private resolveSessionExpiry(payload: Pick<RefreshPayload, 'sessionExp' | 'exp'>): number {
    const sessionExp = payload.sessionExp ?? payload.exp;
    if (!sessionExp) throw new UnauthorizedException('Refresh token invalid.');
    return sessionExp;
  }

  private nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
  }
}
