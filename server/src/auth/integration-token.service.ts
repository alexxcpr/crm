import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { TenantContext } from 'src/tenant/tenant-context.service';
import type { AuthenticatedUser } from 'src/security/security.types';
import type {
  CreateIntegrationTokenDto,
  RotateIntegrationTokenDto,
} from './dto/integration-token.dto';
import { AuthenticatedUserService } from './authenticated-user.service';
import type { IntegrationScope } from './integration-token.types';

const TOKEN_PATTERN = /^mvi_([a-f0-9]{16})\.([A-Za-z0-9_-]{32,})$/;

@Injectable()
export class IntegrationTokenService {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly authenticatedUsers: AuthenticatedUserService,
  ) {}

  async list(profileId: string) {
    const rows = await this.tenantContext.knex('integration_token')
      .where({ id_profile: profileId })
      .orderBy('date_created', 'desc')
      .select(
        'id_integration_token',
        'name',
        'token_prefix',
        'scopes',
        'expires_at',
        'revoked_at',
        'last_used_at',
        'date_created',
        'date_updated',
      );
    return rows.map((row) => this.publicRow(row));
  }

  async create(
    profileId: string,
    dto: CreateIntegrationTokenDto,
  ) {
    const expiresAt = this.validateExpiry(dto.expiresAt);
    const prefix = randomBytes(8).toString('hex');
    const secret = randomBytes(32).toString('base64url');
    const secretHash = await argon2.hash(secret);
    const scopes = [...new Set(dto.scopes)];
    const [row] = await this.tenantContext.knex('integration_token')
      .insert({
        id_profile: profileId,
        name: dto.name.trim(),
        token_prefix: prefix,
        secret_hash: secretHash,
        scopes: JSON.stringify(scopes),
        expires_at: expiresAt,
      })
      .returning('*');

    return {
      ...this.publicRow(row),
      token: `mvi_${prefix}.${secret}`,
    };
  }

  async rotate(
    id: string,
    profileId: string,
    dto: RotateIntegrationTokenDto,
  ) {
    const existing = await this.ownedToken(id, profileId);
    if (existing.revoked_at) {
      throw new BadRequestException(
        'Token-ul revocat nu poate fi rotit.',
      );
    }
    const secret = randomBytes(32).toString('base64url');
    const secretHash = await argon2.hash(secret);
    const expiresAt =
      dto.expiresAt === undefined
        ? existing.expires_at
        : this.validateExpiry(dto.expiresAt);
    const [row] = await this.tenantContext.knex('integration_token')
      .where({ id_integration_token: id })
      .update({
        secret_hash: secretHash,
        expires_at: expiresAt,
        date_updated: new Date(),
      })
      .returning('*');
    return {
      ...this.publicRow(row),
      token: `mvi_${row.token_prefix}.${secret}`,
    };
  }

  async revoke(id: string, profileId: string) {
    await this.ownedToken(id, profileId);
    const [row] = await this.tenantContext.knex('integration_token')
      .where({ id_integration_token: id })
      .update({
        revoked_at: new Date(),
        date_updated: new Date(),
      })
      .returning('*');
    return this.publicRow(row);
  }

  async authenticate(token: string): Promise<AuthenticatedUser> {
    const match = TOKEN_PATTERN.exec(token);
    if (!match) throw new UnauthorizedException('Token de integrare invalid.');
    const [, prefix, secret] = match;
    const row = await this.tenantContext.knex('integration_token')
      .where({ token_prefix: prefix })
      .first();
    if (
      !row ||
      row.revoked_at ||
      (row.expires_at && new Date(row.expires_at) <= new Date())
    ) {
      throw new UnauthorizedException('Token de integrare invalid sau expirat.');
    }
    if (!(await argon2.verify(row.secret_hash, secret))) {
      throw new UnauthorizedException('Token de integrare invalid.');
    }

    const profile = await this.tenantContext.knex('profile')
      .where({ id_profile: row.id_profile, is_active: true })
      .first('id_user');
    if (!profile) throw new UnauthorizedException();

    const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
    await this.tenantContext.knex('integration_token')
      .where({ id_integration_token: row.id_integration_token })
      .where((query) =>
        query.whereNull('last_used_at').orWhere('last_used_at', '<', staleBefore),
      )
      .update({ last_used_at: new Date() });

    return this.authenticatedUsers.load(
      profile.id_user,
      row.id_profile,
      {
        type: 'integration_token',
        integrationTokenId: row.id_integration_token,
        integrationScopes: this.parseScopes(row.scopes),
      },
    );
  }

  private async ownedToken(id: string, profileId: string) {
    const row = await this.tenantContext.knex('integration_token')
      .where({ id_integration_token: id, id_profile: profileId })
      .first();
    if (!row) throw new NotFoundException('Token-ul de integrare nu exista.');
    return row;
  }

  private validateExpiry(value?: string): Date | null {
    if (!value) return null;
    const date = new Date(value);
    if (date <= new Date()) {
      throw new BadRequestException('Data expirarii trebuie sa fie in viitor.');
    }
    return date;
  }

  private parseScopes(value: unknown): IntegrationScope[] {
    if (Array.isArray(value)) return value as IntegrationScope[];
    if (typeof value !== 'string') return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as IntegrationScope[]) : [];
    } catch {
      return [];
    }
  }

  private publicRow(row: Record<string, any>) {
    return {
      id: row.id_integration_token,
      name: row.name,
      prefix: `mvi_${row.token_prefix}`,
      scopes: this.parseScopes(row.scopes),
      expiresAt: row.expires_at ?? null,
      revokedAt: row.revoked_at ?? null,
      lastUsedAt: row.last_used_at ?? null,
      dateCreated: row.date_created,
      dateUpdated: row.date_updated,
    };
  }
}
