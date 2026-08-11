import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { Knex } from 'knex';
import { TenantContext } from 'src/tenant/tenant-context.service';
import type {
  Entity,
  FieldWithRelation,
  SequenceDefinition,
} from 'src/types/entities';
import type {
  NormalizedSequenceManifest,
  SequenceDateParts,
  SequenceManifest,
} from './sequence.types';

const ALLOWED_TOKENS = new Set([
  'prefix',
  'number',
  'day',
  'month',
  'year',
]);
const GLOBAL_SCOPE_KEY = '__global__';
const NO_PERIOD_KEY = '__all__';

@Injectable()
export class SequenceService {
  constructor(private readonly tenantContext: TenantContext) {}

  private get knex() {
    return this.tenantContext.knex;
  }

  normalizeManifest(
    manifest: SequenceManifest,
  ): NormalizedSequenceManifest {
    const normalized: NormalizedSequenceManifest = {
      key: String(manifest.key ?? '').trim(),
      scope: manifest.scope,
      reset: manifest.reset,
      format: String(manifest.format ?? ''),
      prefix: String(manifest.prefix ?? ''),
      padding: manifest.padding ?? 1,
      start_value: manifest.start_value ?? 1,
    };
    if (!/^[a-z][a-z0-9_]{1,50}$/.test(normalized.key)) {
      throw new BadRequestException(
        'Cheia secventei este invalida.',
      );
    }
    if (!['global', 'entity'].includes(normalized.scope)) {
      throw new BadRequestException(
        'Scope-ul secventei trebuie sa fie global sau entity.',
      );
    }
    if (!['none', 'yearly'].includes(normalized.reset)) {
      throw new BadRequestException(
        'Resetarea secventei trebuie sa fie none sau yearly.',
      );
    }
    if (
      !Number.isSafeInteger(normalized.padding) ||
      normalized.padding < 1 ||
      normalized.padding > 18
    ) {
      throw new BadRequestException(
        'Padding-ul secventei trebuie sa fie intre 1 si 18.',
      );
    }
    if (
      !Number.isSafeInteger(normalized.start_value) ||
      normalized.start_value < 1
    ) {
      throw new BadRequestException(
        'Valoarea initiala a secventei trebuie sa fie un intreg pozitiv sigur.',
      );
    }
    if (
      normalized.prefix.length > 100 ||
      /[{}]/.test(normalized.prefix)
    ) {
      throw new BadRequestException(
        'Prefixul secventei este invalid.',
      );
    }
    this.validateFormat(normalized);
    return normalized;
  }

  async resolveDefinition(
    executor: Knex | Knex.Transaction,
    manifest: SequenceManifest,
    options: {
      currentDefinitionId?: string | null;
      currentFieldId?: string;
    } = {},
  ): Promise<SequenceDefinition> {
    const normalized = this.normalizeManifest(manifest);
    const existing = await executor('sequence_definition')
      .where('key', normalized.key)
      .first();
    if (!existing) {
      const [created] = await executor('sequence_definition')
        .insert(normalized)
        .returning('*');
      return created as SequenceDefinition;
    }
    if (this.sameConfiguration(existing, normalized)) {
      return existing as SequenceDefinition;
    }
    if (
      existing.id_sequence_definition !==
      options.currentDefinitionId
    ) {
      throw new ConflictException(
        `Secventa "${normalized.key}" exista cu alta configuratie.`,
      );
    }
    await this.assertDefinitionUnused(
      executor,
      existing.id_sequence_definition,
    );
    const otherReference = await executor('field')
      .where(
        'id_sequence_definition',
        existing.id_sequence_definition,
      )
      .modify((query) => {
        if (options.currentFieldId) {
          query.whereNot('id_field', options.currentFieldId);
        }
      })
      .first('id_field');
    if (otherReference) {
      throw new ConflictException(
        `Secventa "${normalized.key}" este folosita de mai multe campuri si nu poate fi modificata local.`,
      );
    }
    const [updated] = await executor('sequence_definition')
      .where(
        'id_sequence_definition',
        existing.id_sequence_definition,
      )
      .update({
        ...normalized,
        date_updated: executor.fn.now(),
      })
      .returning('*');
    return updated as SequenceDefinition;
  }

  manifestMatchesDefinition(
    definition: Record<string, any>,
    manifest: SequenceManifest,
  ) {
    return this.sameConfiguration(
      definition,
      this.normalizeManifest(manifest),
    );
  }

  publicManifest(definition: SequenceDefinition | null | undefined) {
    if (!definition) return null;
    return {
      key: definition.key,
      scope: definition.scope,
      reset: definition.reset,
      format: definition.format,
      prefix: definition.prefix,
      padding: Number(definition.padding),
      start_value: Number(definition.start_value),
    };
  }

  async assertDefinitionUnused(
    executor: Knex | Knex.Transaction,
    definitionId: string,
  ) {
    const counter = await executor('sequence_counter')
      .where('id_sequence_definition', definitionId)
      .first('id_sequence_definition');
    if (counter) {
      throw new ConflictException(
        'Configuratia unei secvente care a alocat deja numere este imutabila.',
      );
    }
  }

  async assertColumnContainsOnlyNulls(
    executor: Knex | Knex.Transaction,
    tableName: string,
    columnName: string,
  ) {
    const existingValue = await executor(tableName)
      .whereNotNull(columnName)
      .first('id');
    if (existingValue) {
      throw new ConflictException(
        'Generatorul poate fi activat numai pe un camp ale carui valori existente sunt toate NULL.',
      );
    }
  }

  async enrichFields<T extends Record<string, any>>(
    fields: T[],
  ): Promise<Array<T & { sequence: SequenceDefinition | null }>> {
    const ids = [
      ...new Set(
        fields
          .map((field) => field.id_sequence_definition)
          .filter(Boolean) as string[],
      ),
    ];
    const definitions = ids.length
      ? await this.knex('sequence_definition').whereIn(
          'id_sequence_definition',
          ids,
        )
      : [];
    const byId = new Map(
      definitions.map((definition) => [
        definition.id_sequence_definition,
        {
          ...definition,
          padding: Number(definition.padding),
          start_value: Number(definition.start_value),
        },
      ]),
    );
    return fields.map((field) => ({
      ...field,
      sequence: field.id_sequence_definition
        ? ((byId.get(field.id_sequence_definition) as
            | SequenceDefinition
            | undefined) ?? null)
        : null,
    }));
  }

  assertNoOverrides(
    body: Record<string, any>,
    fields: FieldWithRelation[],
  ) {
    const overridden = fields.find(
      (field) =>
        field.sequence &&
        (Object.prototype.hasOwnProperty.call(body, field.slug) ||
          Object.prototype.hasOwnProperty.call(
            body,
            field.column_name,
          )),
    );
    if (overridden) {
      throw new BadRequestException(
        `Campul "${overridden.name}" este generat automat si nu poate fi completat manual.`,
      );
    }
  }

  async allocateForRecord(
    trx: Knex.Transaction,
    entity: Entity,
    fields: FieldWithRelation[],
    data: Record<string, any>,
  ): Promise<Map<string, string>> {
    const generated = new Map<string, string>();
    const sequenceFields = fields
      .filter((field) => field.sequence)
      .sort((left, right) =>
        left.sequence!.key.localeCompare(right.sequence!.key) ||
        left.id_field.localeCompare(right.id_field),
      );
    if (!sequenceFields.length) return generated;

    const temporal = await this.transactionDate(trx);
    for (const field of sequenceFields) {
      const definition = field.sequence!;
      const scopeKey =
        definition.scope === 'global'
          ? GLOBAL_SCOPE_KEY
          : entity.id_entity;
      const periodKey =
        definition.reset === 'yearly'
          ? temporal.parts.year
          : NO_PERIOD_KEY;
      let result: { rows: Array<{ last_value: string }> };
      try {
        result = await trx.raw<{
          rows: Array<{ last_value: string }>;
        }>(
          `
          INSERT INTO sequence_counter (
            id_sequence_definition,
            scope_key,
            period_key,
            last_value,
            date_created,
            date_updated
          ) VALUES (?, ?, ?, ?, transaction_timestamp(), transaction_timestamp())
          ON CONFLICT (id_sequence_definition, scope_key, period_key)
          DO UPDATE SET
            last_value = sequence_counter.last_value + 1,
            date_updated = transaction_timestamp()
          RETURNING last_value
          `,
          [
            definition.id_sequence_definition,
            scopeKey,
            periodKey,
            String(definition.start_value),
          ],
        );
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          (error as { code?: string }).code === '22003'
        ) {
          throw new ConflictException(
            `Secventa "${definition.key}" si-a epuizat intervalul BIGINT.`,
          );
        }
        throw error;
      }
      const value = this.formatValue(
        definition,
        BigInt(result.rows[0].last_value),
        temporal.parts,
      );
      data[field.column_name] = value;
      generated.set(field.column_name, value);
    }
    return generated;
  }

  assertGeneratedValuesUnchanged(
    generated: Map<string, string>,
    data: Record<string, any>,
  ) {
    for (const [column, value] of generated) {
      if (data[column] !== value) {
        throw new BadRequestException(
          `Campul secvential "${column}" nu poate fi modificat de workflow-ul before_insert.`,
        );
      }
    }
  }

  formatValue(
    definition: Pick<
      SequenceDefinition,
      'format' | 'prefix' | 'padding'
    >,
    value: bigint,
    parts: SequenceDateParts,
  ) {
    const number = value
      .toString()
      .padStart(Number(definition.padding), '0');
    return definition.format.replace(
      /\{(prefix|number|day|month|year)\}/g,
      (_, token: keyof SequenceDateParts | 'prefix' | 'number') => {
        if (token === 'prefix') return definition.prefix;
        if (token === 'number') return number;
        return parts[token];
      },
    );
  }

  dateParts(instant: Date, timezone: string): SequenceDateParts {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const values = Object.fromEntries(
      formatter
        .formatToParts(instant)
        .filter((part) =>
          ['day', 'month', 'year'].includes(part.type),
        )
        .map((part) => [part.type, part.value]),
    );
    return {
      day: values.day,
      month: values.month,
      year: values.year,
    };
  }

  private validateFormat(manifest: NormalizedSequenceManifest) {
    if (!manifest.format || manifest.format.length > 255) {
      throw new BadRequestException(
        'Formatul secventei trebuie sa aiba intre 1 si 255 de caractere.',
      );
    }
    const tokens = [
      ...manifest.format.matchAll(/\{([^{}]+)\}/g),
    ].map((match) => match[1]);
    if (
      tokens.filter((token) => token === 'number').length !== 1
    ) {
      throw new BadRequestException(
        'Formatul secventei trebuie sa contina exact un token {number}.',
      );
    }
    if (tokens.some((token) => !ALLOWED_TOKENS.has(token))) {
      throw new BadRequestException(
        'Formatul secventei contine tokenuri necunoscute.',
      );
    }
    const withoutKnownTokens = manifest.format.replace(
      /\{(prefix|number|day|month|year)\}/g,
      '',
    );
    if (/[{}]/.test(withoutKnownTokens)) {
      throw new BadRequestException(
        'Formatul secventei contine acolade neinchise sau tokenuri invalide.',
      );
    }
    if (
      manifest.reset === 'yearly' &&
      !tokens.includes('year')
    ) {
      throw new BadRequestException(
        'O secventa cu resetare anuala trebuie sa includa tokenul {year}.',
      );
    }
    const maximum = this.formatValue(
      manifest,
      9_223_372_036_854_775_807n,
      { day: '31', month: '12', year: '9999' },
    );
    if (maximum.length > 255) {
      throw new BadRequestException(
        'Formatul secventei poate produce valori mai lungi de 255 de caractere.',
      );
    }
  }

  private sameConfiguration(
    row: Record<string, any>,
    manifest: NormalizedSequenceManifest,
  ) {
    return (
      row.key === manifest.key &&
      row.scope === manifest.scope &&
      row.reset === manifest.reset &&
      row.format === manifest.format &&
      row.prefix === manifest.prefix &&
      Number(row.padding) === manifest.padding &&
      String(row.start_value) === String(manifest.start_value)
    );
  }

  private async transactionDate(trx: Knex.Transaction) {
    const result = await trx.raw<{
      rows: Array<{ instant: Date; timezone: string }>;
    }>(`
      SELECT
        transaction_timestamp() AS instant,
        COALESCE(
          (SELECT timezone FROM tenant_configuration WHERE id_configuration = 1),
          'Europe/Bucharest'
        ) AS timezone
    `);
    const row = result.rows[0];
    return {
      instant: new Date(row.instant),
      timezone: row.timezone,
      parts: this.dateParts(new Date(row.instant), row.timezone),
    };
  }
}
