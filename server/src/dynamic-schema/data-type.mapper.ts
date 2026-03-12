import { Knex } from 'knex';

export interface ColumnDefinition {
  columnName: string;
  dataType: string;
  isRequired: boolean;
  isUnique: boolean;
  defaultValue?: string | null;
  relationTableName?: string | null; // pentru FK-uri (ui_type = relation)
}

export function applyColumn(
  table: Knex.CreateTableBuilder | Knex.AlterTableBuilder,
  col: ColumnDefinition,
) {
  let column: Knex.ColumnBuilder;

  switch (col.dataType) {
    case 'varchar':
      column = table.string(col.columnName, 255);
      break;
    case 'text':
      column = table.text(col.columnName);
      break;
    case 'integer':
      column = table.integer(col.columnName);
      break;
    case 'numeric':
      column = table.decimal(col.columnName, 15, 2);
      break;
    case 'boolean':
      column = table.boolean(col.columnName);
      break;
    case 'date':
      column = table.date(col.columnName);
      break;
    case 'timestamp':
      column = table.timestamp(col.columnName, { useTz: true });
      break;
    case 'uuid':
      column = table.uuid(col.columnName);
      break;
    case 'jsonb':
      column = table.jsonb(col.columnName);
      break;
    default:
      column = table.string(col.columnName, 255);
  }

  if (col.isRequired) {
    column.notNullable();
  } else {
    column.nullable();
  }

  if (col.isUnique) {
    column.unique();
  }

  if (col.defaultValue !== undefined && col.defaultValue !== null) {
    column.defaultTo(castDefault(col.dataType, col.defaultValue));
  }

  return column;
}

function castDefault(dataType: string, value: string): any {
  switch (dataType) {
    case 'boolean':
      return value === 'true';
    case 'integer':
      return parseInt(value, 10);
    case 'numeric':
      return parseFloat(value);
    case 'jsonb':
      return JSON.parse(value);
    default:
      return value;
  }
}