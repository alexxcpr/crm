import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { KnexService } from "src/knex/knex.service";
import { FieldWithRelation } from "./dynamic-data.service";

@Injectable()
export class DynamicValidationService {
    constructor(private readonly knex: KnexService) {}

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
        
            const value = body[field.slug] ?? body[field.column_name] ?? undefined;

            // Required check (doar la create, sau la update daca e trimis explicit ca null)
            if (field.is_required && mode == 'create' && (value === undefined || value === null || value === '' )) {
                errors.push(`Campul "${field.name}" este obligatoriu.`);
                break;
            }

            // Daca nu e trimis la update, skip
            if (value === undefined) continue;

            // Type casting - TODO: De vazut daca pot folosi data-type.mapper.ts pentru casting?
            const casted = this.castValue(value, field.data_type);

            // Validation rules
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

        if (errors.length > 0){
            throw new BadRequestException(errors);
        }

        // Unique checks (dupa ce toata validarea a trecut)
        for (const field of fields) {
            if (!field.is_unique) continue;
            const value = sanitized[field.column_name];
            if (value === undefined || value === null) continue;

            const existing = await this.knex.instance(tableName)
                .where(field.column_name, value)
                .modify((qb) => {
                    if (mode === 'update' && recordId) {
                        qb.whereNot('id', recordId);
                    }
                })
                .first();

            if (existing) {//TODO: de verificat, daca fac update si trimit tot tabelul, imi da eroare? nu vreau sa trimit doar campurile modificate
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
            case 'integer': 
                const intVal = parseInt(value, 10);
                if (isNaN(intVal)) {
                    throw new BadRequestException(`Valoarea "${value}" nu este un numar intreg valid.`);
                }
                return intVal;

            case 'numeric':
                const numVal = parseFloat(value);
                return isNaN(numVal) ? value : numVal;

            case 'boolean':
                if (typeof value === 'boolean') return value;
                return value === 'true' || value === '1';
                
            default:
                return value;
        }
    }
}