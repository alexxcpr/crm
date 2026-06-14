import { Injectable } from '@nestjs/common';
import { Knex } from 'knex';
import { FieldWithRelation } from 'src/types/entities';

export interface ParsedFilterCondition {
  operator: string;
  value: any;
}

export interface ParsedFilterGroup {
  column: string;
  conditions: ParsedFilterCondition[];
}

@Injectable()
export class FilterParserService {

  parse(query: Record<string, any>, fields: FieldWithRelation[], tableName?: string): ParsedFilterGroup[] {
    const filters: ParsedFilterGroup[] = [];
    const filterObj = query.filter;
    if (!filterObj || typeof filterObj !== 'object') return filters;

    const filterableFields = fields.filter(f => f.visible_in_table || f.is_filterable);
    const allowedColumns = new Set<string>([
      ...filterableFields.map(f => f.slug),
      ...filterableFields.map(f => f.column_name),
      'id',
      'date_created',
      'date_updated',
    ]);

    for (const key of Object.keys(filterObj)) {
      if (!allowedColumns.has(key)) continue;

      // Gaseste column_name real
      const field = fields.find(f => f.slug === key || f.column_name === key);
      const dataType = field?.data_type ?? 'datetime';
      const uiType = field?.ui_type ?? 'datetimepicker';
      let column = field?.column_name ?? key;
      if (tableName) {
        column = `${tableName}.${column}`;
      }

      const conditions = this.parseColumnConditions(filterObj[key])
        .map(condition => this.normalizeCondition(condition, dataType, uiType))
        .filter((condition): condition is ParsedFilterCondition => condition !== null);

      if (conditions.length > 0) {
        filters.push({ column, conditions });
      }
    }

    return filters;
  }

  apply<T extends Knex.QueryBuilder>(query: T, filter: ParsedFilterGroup): T {
    if (filter.conditions.length === 0) return query;

    if (filter.conditions.length === 1) {
      this.applyCondition(query, filter.column, filter.conditions[0], 'where');
      return query;
    }

    return query.where((builder) => {
      filter.conditions.forEach((condition, index) => {
        this.applyCondition(builder, filter.column, condition, index === 0 ? 'where' : 'or');
      });
    }) as T;
  }

  private parseColumnConditions(value: any): ParsedFilterCondition[] {
    if (value === null || value === undefined || value === '') return [];

    if (Array.isArray(value)) {
      return value.flatMap(item => this.parseColumnConditions(item));
    }

    if (typeof value !== 'object') {
      return [{ operator: 'eq', value }];
    }

    const keys = Object.keys(value);
    const numericKeys = keys.filter(key => /^\d+$/.test(key));
    if (numericKeys.length > 0) {
      return numericKeys
        .sort((a, b) => Number(a) - Number(b))
        .flatMap(key => this.parseColumnConditions(value[key]));
    }

    if (typeof value.op === 'string') {
      return [{ operator: value.op, value: value.value }];
    }

    return keys.map(key => ({ operator: key, value: value[key] }));
  }

  private normalizeCondition(
    condition: ParsedFilterCondition,
    dataType: string,
    uiType: string,
  ): ParsedFilterCondition | null {
    const operator = condition.operator === 'neq' ? 'not_eq' : condition.operator;
    const allowedOperators = this.getAllowedOperators(dataType, uiType);
    if (!allowedOperators.has(operator)) return null;

    if (operator === 'is_null') {
      return { operator, value: this.toBoolean(condition.value) };
    }

    if (operator === 'between') {
      const range = this.parseRange(condition.value, dataType);
      if (!range) return null;
      return { operator, value: range };
    }

    if (operator === 'in') {
      const values = Array.isArray(condition.value)
        ? condition.value
        : String(condition.value).split(',');
      const normalized = values
        .map(value => this.castValue(value, dataType))
        .filter(value => value !== null && value !== undefined && value !== '');
      return normalized.length > 0 ? { operator, value: normalized } : null;
    }

    const value = this.castValue(condition.value, dataType);
    if (value === null || value === undefined || value === '') return null;
    return { operator, value };
  }

  private getAllowedOperators(dataType: string, uiType: string): Set<string> {
    if (uiType === 'relation') {
      return new Set(['eq', 'in', 'is_null']);
    }

    switch (dataType) {
      case 'varchar':
      case 'text':
        return new Set(['eq', 'contains', 'starts_with', 'is_null']);
      case 'integer':
      case 'numeric':
      case 'datetime':
        return new Set(['eq', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null']);
      case 'boolean':
        return new Set(['eq', 'is_null']);
      case 'uuid':
        return new Set(['eq', 'in', 'is_null']);
      default:
        return new Set(['eq', 'is_null']);
    }
  }

  private parseRange(value: any, dataType: string): [any, any] | null {
    const rawValues = Array.isArray(value) ? value : String(value).split(',');
    if (rawValues.length < 2) return null;

    const min = this.castValue(rawValues[0], dataType);
    const max = this.castValue(rawValues[1], dataType);
    if (min === null || min === undefined || min === '' || max === null || max === undefined || max === '') {
      return null;
    }
    return [min, max];
  }

  private castValue(value: any, dataType: string): any {
    if (value === null || value === undefined || value === '') return null;

    switch (dataType) {
      case 'integer': {
        const intValue = parseInt(String(value), 10);
        return Number.isNaN(intValue) ? null : intValue;
      }
      case 'numeric': {
        const numValue = parseFloat(String(value));
        return Number.isNaN(numValue) ? null : numValue;
      }
      case 'boolean':
        return this.toBoolean(value);
      default:
        return value;
    }
  }

  private toBoolean(value: any): boolean {
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === '1' || value === 1;
  }

  private applyCondition(
    query: Knex.QueryBuilder,
    column: string,
    condition: ParsedFilterCondition,
    mode: 'where' | 'or',
  ): void {
    const { operator, value } = condition;
    const useOr = mode === 'or';

    switch (operator) {
      case 'eq':
        useOr ? query.orWhere(column, value) : query.where(column, value);
        break;
      case 'contains':
        useOr ? query.orWhereILike(column, `%${value}%`) : query.whereILike(column, `%${value}%`);
        break;
      case 'starts_with':
        useOr ? query.orWhereILike(column, `${value}%`) : query.whereILike(column, `${value}%`);
        break;
      case 'gt':
        useOr ? query.orWhere(column, '>', value) : query.where(column, '>', value);
        break;
      case 'gte':
        useOr ? query.orWhere(column, '>=', value) : query.where(column, '>=', value);
        break;
      case 'lt':
        useOr ? query.orWhere(column, '<', value) : query.where(column, '<', value);
        break;
      case 'lte':
        useOr ? query.orWhere(column, '<=', value) : query.where(column, '<=', value);
        break;
      case 'in':
        useOr ? query.orWhereIn(column, value) : query.whereIn(column, value);
        break;
      case 'is_null':
        if (value) {
          useOr ? query.orWhereNull(column) : query.whereNull(column);
        } else {
          useOr ? query.orWhereNotNull(column) : query.whereNotNull(column);
        }
        break;
      case 'between':
        useOr ? query.orWhereBetween(column, value) : query.whereBetween(column, value);
        break;
      default:
        break;
    }
  }
}
