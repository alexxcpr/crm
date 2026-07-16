import { BadRequestException } from '@nestjs/common';
import type { Knex } from 'knex';
import type { RankedItemDto } from './dto/reorder.dto';

interface ReorderRanksOptions {
  table: string;
  idColumn: string;
  items: RankedItemDto[];
  scope?: Record<string, string | null>;
}

export async function reorderRanks(
  knex: Knex,
  {
    table,
    idColumn,
    items,
    scope = {},
  }: ReorderRanksOptions,
): Promise<void> {
  const ids = items.map((item) => item.id);

  await knex.transaction(async (trx) => {
    let query = trx(table)
      .select(idColumn)
      .whereIn(idColumn, ids);
    for (const [column, value] of Object.entries(
      scope,
    )) {
      query =
        value === null
          ? query.whereNull(column)
          : query.where(column, value);
    }

    const existing = await query;
    if (existing.length !== items.length) {
      throw new BadRequestException(
        'Lista de reordonare contine elemente inexistente sau din alt grup.',
      );
    }

    const updatedAt = new Date();
    for (const item of items) {
      await trx(table)
        .where(idColumn, item.id)
        .update({
          rank: item.rank,
          date_updated: updatedAt,
        });
    }
  });
}
