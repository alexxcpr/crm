import { BadRequestException, Injectable } from '@nestjs/common';
import { TenantContext } from 'src/tenant/tenant-context.service';

export interface RelationFieldMetadata {
  id_field?: string;
  name?: string;
  slug?: string;
  ui_type?: string;
  id_relation_entity: string | null;
  relation_display_field: string | null;
}

export interface ResolvedRelationDisplayField {
  id_field: string;
  slug: string;
  column_name: string;
}

export type EnrichedRelationField<T> = T & {
  relation_display_field: string | null;
  relation_display_column: string | null;
};

@Injectable()
export class RelationDisplayFieldService {
  constructor(
    private readonly tenantContext: TenantContext,
  ) {}

  private get knex() {
    return this.tenantContext.knex;
  }

  async resolveForTarget(
    targetEntityId: string,
    reference: string | null | undefined,
    relationLabel?: string,
  ): Promise<ResolvedRelationDisplayField> {
    if (!reference) {
      throw this.configurationError(
        reference,
        relationLabel,
      );
    }

    const candidates = await this.knex('field')
      .where('id_entity', targetEntityId)
      .andWhere((builder) =>
        builder
          .where('slug', reference)
          .orWhere('column_name', reference),
      )
      .select(
        'id_field',
        'slug',
        'column_name',
      );

    return this.pickSingleCandidate(
      candidates,
      reference,
      relationLabel,
    );
  }

  async enrichFields<T extends RelationFieldMetadata>(
    fields: T[],
  ): Promise<Array<EnrichedRelationField<T>>> {
    const relationFields = fields.filter(
      (field) =>
        field.ui_type === 'relation' &&
        field.id_relation_entity,
    );
    if (!relationFields.length) {
      return fields.map((field) => ({
        ...field,
        relation_display_column: null,
      }));
    }

    const targetEntityIds = [
      ...new Set(
        relationFields.map(
          (field) => field.id_relation_entity!,
        ),
      ),
    ];
    const targetFields = await this.knex('field')
      .whereIn('id_entity', targetEntityIds)
      .select(
        'id_field',
        'id_entity',
        'slug',
        'column_name',
      );
    const byTarget = new Map<string, any[]>();
    for (const targetField of targetFields) {
      const bucket =
        byTarget.get(targetField.id_entity) ?? [];
      bucket.push(targetField);
      byTarget.set(targetField.id_entity, bucket);
    }

    return fields.map((field) => {
      if (
        field.ui_type !== 'relation' ||
        !field.id_relation_entity
      ) {
        return {
          ...field,
          relation_display_column: null,
        };
      }
      const reference = field.relation_display_field;
      if (!reference) {
        throw this.configurationError(
          reference,
          field.name ?? field.slug,
        );
      }
      const candidates = (
        byTarget.get(field.id_relation_entity) ?? []
      ).filter(
        (candidate) =>
          candidate.slug === reference ||
          candidate.column_name === reference,
      );
      const resolved = this.pickSingleCandidate(
        candidates,
        reference,
        field.name ?? field.slug,
      );
      return {
        ...field,
        relation_display_field: resolved.slug,
        relation_display_column:
          resolved.column_name,
      };
    });
  }

  private pickSingleCandidate(
    candidates: Array<ResolvedRelationDisplayField>,
    reference: string,
    relationLabel?: string,
  ): ResolvedRelationDisplayField {
    const uniqueCandidates = [
      ...new Map(
        candidates.map((candidate) => [
          candidate.id_field,
          candidate,
        ]),
      ).values(),
    ];
    if (uniqueCandidates.length !== 1) {
      throw this.configurationError(
        reference,
        relationLabel,
        uniqueCandidates.length > 1,
      );
    }
    return uniqueCandidates[0];
  }

  private configurationError(
    reference: string | null | undefined,
    relationLabel?: string,
    ambiguous = false,
  ) {
    const relation = relationLabel
      ? ` pentru relatia "${relationLabel}"`
      : '';
    const reason = ambiguous
      ? 'este ambiguu'
      : 'nu exista in metadata entitatii tinta';
    return new BadRequestException(
      `Campul de afisare "${reference ?? ''}"${relation} ${reason}. Reconfigureaza relatia din builder.`,
    );
  }
}
