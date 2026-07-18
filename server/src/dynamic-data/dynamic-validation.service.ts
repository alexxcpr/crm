import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { FieldWithRelation } from 'src/types/entities';
import { isUUID } from 'class-validator';

@Injectable()
export class DynamicValidationService {
  constructor(private readonly tenantContext: TenantContext) {}

  private get knex() { return this.tenantContext.knex; }

  async validateAndSanitize(
    body: Record<string, any>,
    fields: FieldWithRelation[],
    tableName: string,
    mode: 'create' | 'update',
    recordId?: string,
  ): Promise<Record<string, any>> {
    const sanitized: Record<string, any> = {};
    const errors: string[] = [];

    for (const field of fields) {
      if (!field.visible_in_form) continue;

      const value = Object.prototype.hasOwnProperty.call(body, field.slug)
        ? body[field.slug]
        : body[field.column_name];
      const isEmptyRequiredValue = value === undefined || value === null || value === '';

      // Required check (doar la create, sau la update daca e trimis explicit ca null)
      if (field.is_required && (mode === 'create' || value !== undefined) && isEmptyRequiredValue) {
        errors.push(`Campul "${field.name}" este obligatoriu.`);
        break;
      }

      if (value === undefined) continue;

      const casted = this.castValue(value, field.data_type);

      const rules = field.validation_rules as Record<string, any> | null;
      if (rules && value !== null) {
        if (rules.min_length && typeof casted === 'string' && casted.length < rules.min_length) {
          errors.push(`"${field.name}" trebuie sa aiba minim ${rules.min_length} caractere.`);
        }
        if (rules.max_length && typeof casted === 'string' && casted.length > rules.max_length) {
          errors.push(`"${field.name}" poate avea maxim ${rules.max_length} caractere.`);
        }
        if (rules.min !== undefined && typeof casted === 'number' && casted < rules.min) {
          errors.push(`"${field.name}" trebuie sa fie minim ${rules.min}.`);
        }
        if (rules.max !== undefined && typeof casted === 'number' && casted > rules.max) {
          errors.push(`"${field.name}" poate fi maxim ${rules.max}.`);
        }
        if (rules.pattern && typeof casted === 'string' && !new RegExp(rules.pattern).test(casted)) {
          errors.push(`"${field.name}" nu respecta formatul cerut.`);
        }
      }

      sanitized[field.column_name] = casted;
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }

    // Unique checks (dupa ce toata validarea a trecut)
    for (const field of fields) {
      if (!field.is_unique) continue;
      const value = sanitized[field.column_name];
      if (value === undefined || value === null) continue;

      const existing = await this.knex(tableName)
        .where(field.column_name, value)
        .modify((qb) => {
          if (mode === 'update' && recordId) {
            qb.whereNot('id', recordId);
          }
        })
        .first();

      if (existing) {
        throw new ConflictException(
          `Valoarea "${value}" exista deja pentru campul "${field.name}".`,
        );
      }
    }
    return sanitized;
  }

  private castValue(value: any, dataType: string) {
    if (value === null || value === '') return null;

    switch (dataType) {
      case 'integer': {
        const intVal = parseInt(value, 10);
        if (isNaN(intVal)) {
          throw new BadRequestException(`Valoarea "${value}" nu este un numar intreg valid.`);
        }
        return intVal;
      }
      case 'numeric': {
        const numVal = parseFloat(value);
        return isNaN(numVal) ? value : numVal;
      }
      case 'boolean':
        if (typeof value === 'boolean') return value;
        return value === 'true' || value === '1';
      case 'uuid':
        if (typeof value !== 'string' || !isUUID(value)) {
          throw new BadRequestException('Valoarea UUID trimisa nu este valida.');
        }
        return value;
      default:
        return value;
    }
  }
}
