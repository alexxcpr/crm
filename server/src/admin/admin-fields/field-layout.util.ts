import { BadRequestException } from '@nestjs/common';

const GRID_COLUMNS = 3;

export interface LayoutFieldLike {
    id_field?: string;
    slug?: string;
    name?: string;
    group_name?: string | null;
    rank: number;
    grid_col: number;
    col_span: number;
}

export interface FieldPlacement<T extends LayoutFieldLike> {
    field: T;
    rowStart: number;
    colStart: number;
    colSpan: number;
}

function getFieldLabel(field: LayoutFieldLike): string {
    return field.name ?? field.slug ?? field.id_field ?? 'Camp';
}

export function sortFieldsForLayout<T extends LayoutFieldLike>(fields: T[]): T[] {
    return [...fields].sort((a, b) =>
        a.rank - b.rank
        || a.grid_col - b.grid_col
        || (a.id_field ?? a.slug ?? '').localeCompare(b.id_field ?? b.slug ?? '')
    );
}

export function validateFieldLayout(field: LayoutFieldLike): void {
    const label = getFieldLabel(field);

    if (!Number.isInteger(field.rank) || field.rank < 1) {
        throw new BadRequestException(`Campul "${label}" trebuie sa aiba rank >= 1.`);
    }

    if (!Number.isInteger(field.grid_col) || field.grid_col < 1 || field.grid_col > GRID_COLUMNS) {
        throw new BadRequestException(`Campul "${label}" trebuie sa aiba grid_col intre 1 si 3.`);
    }

    if (!Number.isInteger(field.col_span) || field.col_span < 1 || field.col_span > GRID_COLUMNS) {
        throw new BadRequestException(`Campul "${label}" trebuie sa aiba col_span intre 1 si 3.`);
    }

    const endCol = field.grid_col + field.col_span - 1;
    if (endCol > GRID_COLUMNS) {
        throw new BadRequestException(
            `Campul "${label}" nu incape in grila: grid_col ${field.grid_col} cu col_span ${field.col_span} depaseste latimea de 3 coloane puse la dispozitie.`,
        );
    }
}

function isRowSlotFree(row: boolean[], colStart: number, colSpan: number): boolean {
    const startIndex = colStart - 1;
    const endIndex = startIndex + colSpan;

    for (let index = startIndex; index < endIndex; index += 1) {
        if (row[index]) return false;
    }

    return true;
}

function markRowSlot(row: boolean[], colStart: number, colSpan: number): void {
    const startIndex = colStart - 1;
    const endIndex = startIndex + colSpan;

    for (let index = startIndex; index < endIndex; index += 1) {
        row[index] = true;
    }
}

export function computeFieldPlacements<T extends LayoutFieldLike>(fields: T[]): FieldPlacement<T>[] {
    const rows: boolean[][] = [];

    return sortFieldsForLayout(fields).map((field) => {
        validateFieldLayout(field);

        let rowStart = 1;

        while (true) {
            const row = rows[rowStart - 1] ?? Array.from({ length: GRID_COLUMNS }, () => false);
            rows[rowStart - 1] = row;

            if (isRowSlotFree(row, field.grid_col, field.col_span)) {
                markRowSlot(row, field.grid_col, field.col_span);

                return {
                    field,
                    rowStart,
                    colStart: field.grid_col,
                    colSpan: field.col_span,
                };
            }

            rowStart += 1;
        }
    });
}

export function validateGroupFieldLayout<T extends LayoutFieldLike>(fields: T[]): void {
    computeFieldPlacements(fields);
}
