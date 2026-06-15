import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Knex } from 'knex';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { Entity, Field } from 'src/types/entities';
import { applyColumn, ColumnDefinition } from './data-type.mapper';

const SLUG_REGEX = /^[a-z][a-z0-9_]{1,50}$/;

@Injectable()
export class DynamicSchemaService {
  private readonly logger = new Logger(DynamicSchemaService.name);

  constructor(private readonly tenantContext: TenantContext) {}

  private get knex() { return this.tenantContext.knex; }

  async createEntityTable(entity: Entity): Promise<void> {
    const tableName = this.ensureTablePrefix(entity.table_name);

    const exists = await this.knex.schema.hasTable(tableName);
    if (exists) {
      this.logger.warn(`Tabela "${tableName}" exista deja, skip.`);
      return;
    }

    await this.knex.schema.createTable(tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.knex.fn.uuid());
      table.timestamp('date_created', { useTz: true }).notNullable().defaultTo(this.knex.fn.now());
      table.timestamp('date_updated', { useTz: true }).notNullable().defaultTo(this.knex.fn.now());
      table.uuid('id_profile').nullable().references('id_profile').inTable('profile').onDelete('RESTRICT');
      table.index('id_profile', `idx_${tableName}_id_profile`);
    });

    this.logger.log(`Tabela "${tableName}" a fost creata cu succes.`);
  }

  async addColumn(entity: Entity, field: Field): Promise<void> {
    this.validateSlug(field.slug);
    //validare slug (doar litere mici, cifre, underline, 2-51 caractere, sa nu inceapa cu cifra 
    const tableName = entity.table_name;

    const columnName = this.ensureColumnPrefix(field);
    const hasColumn = await this.knex.schema.hasColumn(tableName, columnName);
    if (hasColumn) {
      this.logger.warn(`Coloana "${columnName}" exista deja in "${tableName}", skip`);
      return;
    }

    const needsNotNull = field.is_required && !field.default_value;
    const rowCount = await this.knex(tableName).count('* as cnt').first();
    const tableHasData = rowCount && Number(rowCount.cnt) > 0;

    if (needsNotNull && tableHasData) {
      await this.knex.schema.alterTable(tableName, (table) => {
        applyColumn(table, {
          columnName,
          dataType: field.data_type,
          isRequired: false,
          isUnique: false,
          defaultValue: null,
        });
      });

      const fallback = this.getEmptyDefault(field.data_type);
      await this.knex(tableName)
        .whereNull(columnName)
        .update({ [columnName]: fallback });

      await this.knex.schema.alterTable(tableName, (table) => {
        const col = this.rebuildColumnBuilder(table, field.data_type, columnName);
        col.notNullable().alter();
      });

      if (field.is_unique) {
        await this.knex.schema.alterTable(tableName, (table) => {
          table.unique([columnName]);
        });
      }
    } else {
      await this.knex.schema.alterTable(tableName, (table) => {
        applyColumn(table, {
          columnName,
          dataType: field.data_type,
          isRequired: field.is_required,
          isUnique: field.is_unique,
          defaultValue: field.default_value,
        });
      });
    }

    if (field.ui_type === 'relation' && field.id_relation_entity) {
      await this.addForeignKeyAsync(tableName, field);
    }

    if (field.is_filterable) {
       // Index automat pe campuri filterable
      await this.createIndex(tableName, columnName);
    }

    this.logger.log(`Coloana "${columnName}" a fost adaugata in "${tableName}".`);
  }

  // ─── 3. Șterge o coloană ───
  async removeColumn(entity: Entity, field: Field): Promise<void> {
    if (field.is_system) {
      throw new BadRequestException(
        `Campul "${field.name}" este proprietate de system si nu poate fi sters.`,
      );
    }

    const tableName = entity.table_name;

    await this.knex.schema.alterTable(tableName, (table) => {
      table.dropColumn(this.ensureColumnPrefix(field));
    });

    this.logger.log(`Coloana "${field.column_name}" a fost stearsa din "${tableName}".`);
  }

  // ─── Creează index B-Tree ───
  async createIndex(tableName: string, columnName: string): Promise<void> {
    const indexName = `idx_${tableName}_${columnName}`;

    try {
      await this.knex.schema.alterTable(tableName, (table) => {
        table.index(columnName, indexName);
      });
      this.logger.log(`Index "${indexName}" creat.`);
    } 
    catch (error: any) {
      if (error.messages?.includes('already exists')) {
        this.logger.warn(`Index "${indexName}" exista deja, skip.`);
      }
      else {
        throw error;
      }
    }
  }

  // ─── Populează coloanele sistem dintr-o entitate (bulk) ───
  // Folosit de seed sau de admin la crearea unei entități noi cu câmpuri predefinite
  async addColumnsFromFieldDefinitions(entity: Entity): Promise<void> {
    const fields = await this.knex('field')
      .where('id_entity', entity.id_entity)
      .orderBy('rank', 'asc');

    for (const field of fields) {
      await this.addColumn(entity, field);
    }
  }

  private validateSlug(slug: string): void {
    if (!SLUG_REGEX.test(slug)) {
      throw new BadRequestException(
        `Slug-ul "${slug}" este invalid. Trebuie sa respecte regulile: litere mici, underscore, cifre, 2-51 caractere.`,
      );
    }
  }

  private async addForeignKeyAsync(tableName: string, field: Field): Promise<void> {
    if (!field.id_relation_entity) return;

    const targetEntity = await this.knex('entity')
      .where('id_entity', field.id_relation_entity)
      .first();

    if (!targetEntity) {
      this.logger.warn(`Entitatea tinta pentru FK nu a fost gasita: ${field.id_relation_entity}`);
      return;
    }

    await this.knex.schema.alterTable(tableName, (table) => {
      table.foreign(field.column_name).references('id').inTable(targetEntity.table_name);
    });
  }

  private getEmptyDefault(dataType: string): any {
    switch (dataType) {
      case 'varchar':   return '';
      case 'text':      return '';
      case 'integer':   return 0;
      case 'numeric':   return 0;
      case 'boolean':   return false;
      case 'datetime': return new Date().toISOString();
      case 'uuid':      return '00000000-0000-0000-0000-000000000000';
      default:          return '';
    }
  }

  private rebuildColumnBuilder(
    table: Knex.AlterTableBuilder,
    dataType: string,
    columnName: string,
  ): Knex.ColumnBuilder {
    switch (dataType) {
      case 'varchar':   return table.string(columnName, 255);
      case 'text':      return table.text(columnName);
      case 'integer':   return table.integer(columnName);
      case 'numeric':   return table.decimal(columnName, 15, 2);
      case 'boolean':   return table.boolean(columnName);
      case 'datetime': return table.timestamp(columnName, { useTz: true });
      case 'uuid':      return table.uuid(columnName);
      default:          return table.string(columnName, 255);
    }
  }

  private ensureTablePrefix(tableName: string): string {
    return tableName.startsWith('ent_') ? tableName : `ent_${tableName}`;
  }

  private ensureColumnPrefix(field: Field): string {
    if (field.is_system) return field.column_name;
    return field.column_name.startsWith('cf_') ? field.column_name : `cf_${field.column_name}`;
  }
}
