import { Injectable } from "@nestjs/common";
import { Field } from "@prisma/client";
import { Knex } from 'knex';

export interface ParsedFilter {
    column: string;
    operator: string;
    value: any;
}

@Injectable()
export class FilterParserService {
    
    parse(query: Record<string, any>, fields: Field[]): ParsedFilter[] {
        const filters: ParsedFilter[] = [];
        const filterObj = query.filter;
        if (!filterObj || typeof filterObj !== 'object') return filters;

        const allowedColumns = new Set([
            ...fields.filter(f => f.is_filterable).map(f => f.slug),
            ...fields.filter(f => f.is_filterable).map(f => f.column_name),
            'id', 'date_created', 'date_updated',
        ]);

        for (const key of Object.keys(filterObj)) {
            if (!allowedColumns.has(key)) continue;

            //Gaseste column_name real
            const field = fields.find(f => f.slug === key || f.column_name === key);
            const column = field ? field.column_name : key;

            const val = filterObj[key];

            if (typeof val === 'object' && val !== null) {
                // ?filter[name][contains]=Alex
                for (const op of Object.keys(val)) {
                    filters.push({ column, operator: op, value: val[op] });
                }
            }
            else {
                // ?filter[name]=Alex (equality)
                filters.push({ column, operator: 'eq', value: val });
            }
        }

        return filters;
    }

    apply<T extends Knex.QueryBuilder>(query: T, filter: ParsedFilter): T {
        const { column, operator, value } = filter;

        switch (operator) {
            case 'eq':
                return query.where(column, value) as T;
            case 'contains':
                return query.whereILike(column, `%${value}%`) as T;
            case 'starts_with':
                return query.whereILike(column, `${value}%`) as T;
            case 'gt':
                return query.where(column, '>', value) as T;
            case 'gte':
                return query.where(column, '>=', value) as T;
            case 'lt':
                return query.where(column, '<', value) as T;
            case 'lte':
                return query.where(column, '<=', value) as T;
            case 'in':
                return query.whereIn(column, String(value).split(',')) as T;
            case 'is_null':
                return value === 'true'
                    ? query.whereNull(column) as T
                    : query.whereNotNull(column) as T;
            case 'between': {
                const [min, max] = String(value).split(',');
                return query.whereBetween(column, [min, max]) as T;
            }
            default:
                return query;
        }
    }
}