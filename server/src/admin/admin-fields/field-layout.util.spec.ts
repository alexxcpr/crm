import { BadRequestException } from '@nestjs/common';
import { computeFieldPlacements, validateFieldLayout } from './field-layout.util';

let nextId = 1;

function mockField(overrides: Partial<{
    id_field: string;
    name: string;
    rank: number;
    grid_col: number;
    col_span: number;
}> = {}) {
    return {
        id_field: overrides.id_field ?? `field-${nextId++}`,
        name: overrides.name ?? 'Camp',
        rank: overrides.rank ?? 1,
        grid_col: overrides.grid_col ?? 1,
        col_span: overrides.col_span ?? 1,
    };
}

describe('field-layout.util', () => {
    it('plaseaza primul camp wide pe primul rand cand are rank mai mic', () => {
        const placements = computeFieldPlacements([
            mockField({ id_field: 'b', name: 'Val 2', rank: 2, grid_col: 1, col_span: 1 }),
            mockField({ id_field: 'c', name: 'Val 3', rank: 3, grid_col: 3, col_span: 1 }),
            mockField({ id_field: 'a', name: 'Val 1', rank: 1, grid_col: 1, col_span: 2 }),
        ]);

        expect(placements).toHaveLength(3);
        expect(placements[0]).toMatchObject({
            rowStart: 1,
            colStart: 1,
            colSpan: 2,
            field: expect.objectContaining({ name: 'Val 1' }),
        });
        expect(placements[1]).toMatchObject({
            rowStart: 2,
            colStart: 1,
            colSpan: 1,
            field: expect.objectContaining({ name: 'Val 2' }),
        });
        expect(placements[2]).toMatchObject({
            rowStart: 1,
            colStart: 3,
            colSpan: 1,
            field: expect.objectContaining({ name: 'Val 3' }),
        });
    });

    it('pastreaza toate campurile pe coloana 1 cand toate au grid_col 1', () => {
        const placements = computeFieldPlacements([
            mockField({ id_field: 'a', rank: 1, grid_col: 1 }),
            mockField({ id_field: 'b', rank: 2, grid_col: 1 }),
            mockField({ id_field: 'c', rank: 3, grid_col: 1 }),
        ]);

        expect(placements.map((placement) => ({
            rowStart: placement.rowStart,
            colStart: placement.colStart,
        }))).toEqual([
            { rowStart: 1, colStart: 1 },
            { rowStart: 2, colStart: 1 },
            { rowStart: 3, colStart: 1 },
        ]);
    });

    it('foloseste grid_col ca tie-break cand rank este egal', () => {
        const placements = computeFieldPlacements([
            mockField({ id_field: 'b', name: 'Col 2', rank: 1, grid_col: 2 }),
            mockField({ id_field: 'a', name: 'Col 1', rank: 1, grid_col: 1 }),
        ]);

        expect(placements[0].field.name).toBe('Col 1');
        expect(placements[1].field.name).toBe('Col 2');
    });

    it('respinge camp care nu incape in grila', () => {
        expect(() => validateFieldLayout(
            mockField({ name: 'Camp invalid', grid_col: 3, col_span: 2 }),
        )).toThrow(BadRequestException);
    });
});
