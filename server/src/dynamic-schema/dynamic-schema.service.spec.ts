import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DynamicSchemaService } from './dynamic-schema.service';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { Entity, Field } from 'src/types/entities';

function mockEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id_entity: 'ent-uuid-1',
    id_module: 'mod-uuid-1',
    name: 'Contacte',
    slug: 'contacts',
    table_name: 'ent_contacts',
    icon: 'i-heroicons-users',
    is_system: false,
    label_singular: 'Contact',
    label_plural: 'Contacte',
    rank: 0,
    date_created: new Date('2025-01-01'),
    date_updated: new Date('2025-01-01'),
    ...overrides,
  };
}

function mockField(overrides: Partial<Field> = {}): Field {
  return {
    id_field: 'fld-uuid-1',
    id_entity: 'ent-uuid-1',
    name: 'Industrie',
    slug: 'industry',
    column_name: 'cf_industry',
    data_type: 'varchar',
    ui_type: 'text',
    default_value: null,
    placeholder: null,
    help_text: null,
    options: null,
    is_required: false,
    is_unique: false,
    is_filterable: true,
    is_sortable: true,
    visible_in_table: true,
    visible_in_form: true,
    is_system: false,
    validation_rules: null,
    id_relation_entity: null,
    relation_display_field: null,
    id_ui_tab: '00000000-0000-0000-0000-000000000001',
    rank: 1,
    grid_col: 1,
    col_span: 1,
    date_created: new Date('2025-01-01'),
    date_updated: new Date('2025-01-01'),
    ...overrides,
  };
}

describe('DynamicSchemaService', () => {
  let service: DynamicSchemaService;
  let mockColumnBuilder: Record<string, jest.Mock>;
  let mockTableBuilder: Record<string, jest.Mock | any>;
  let mockSchema: Record<string, jest.Mock>;
  let mockQueryBuilder: Record<string, jest.Mock>;
  let mockKnexInstance: any;
  let mockTenantContext: { knex: any; isAvailable: boolean };

  beforeEach(async () => {
    mockColumnBuilder = {
      primary: jest.fn().mockReturnThis(),
      defaultTo: jest.fn().mockReturnThis(),
      notNullable: jest.fn().mockReturnThis(),
      nullable: jest.fn().mockReturnThis(),
      unique: jest.fn().mockReturnThis(),
      alter: jest.fn().mockReturnThis(),
      references: jest.fn().mockReturnThis(),
      inTable: jest.fn().mockReturnThis(),
      onDelete: jest.fn().mockReturnThis(),
    };

    mockTableBuilder = {
      uuid: jest.fn().mockReturnValue(mockColumnBuilder),
      timestamp: jest.fn().mockReturnValue(mockColumnBuilder),
      string: jest.fn().mockReturnValue(mockColumnBuilder),
      text: jest.fn().mockReturnValue(mockColumnBuilder),
      integer: jest.fn().mockReturnValue(mockColumnBuilder),
      decimal: jest.fn().mockReturnValue(mockColumnBuilder),
      boolean: jest.fn().mockReturnValue(mockColumnBuilder),
      index: jest.fn(),
      dropColumn: jest.fn(),
      unique: jest.fn(),
      foreign: jest.fn().mockReturnValue(mockColumnBuilder),
    };

    mockSchema = {
      hasTable: jest.fn(),
      hasColumn: jest.fn(),
      createTable: jest.fn((_name, cb) => {
        cb(mockTableBuilder);
        return Promise.resolve();
      }),
      alterTable: jest.fn((_name, cb) => {
        cb(mockTableBuilder);
        return Promise.resolve();
      }),
    };

    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      count: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ cnt: 0 }),
      whereNull: jest.fn().mockReturnThis(),
      update: jest.fn().mockResolvedValue(0),
    };

    mockKnexInstance = Object.assign(
      jest.fn().mockReturnValue(mockQueryBuilder),
      {
        schema: mockSchema,
        fn: {
          uuid: jest.fn().mockReturnValue('gen_random_uuid()'),
          now: jest.fn().mockReturnValue('now()'),
        },
      },
    );

    mockTenantContext = {
      knex: mockKnexInstance,
      isAvailable: true,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DynamicSchemaService,
        { provide: TenantContext, useValue: mockTenantContext },
      ],
    }).compile();

    service = module.get(DynamicSchemaService);
  });

  // ═══════════════════════════════════════════
  //  createEntityTable
  // ═══════════════════════════════════════════
  describe('createEntityTable', () => {
    it('creeaza tabela cu coloanele sistem cand nu exista', async () => {
      mockSchema.hasTable.mockResolvedValue(false);

      await service.createEntityTable(mockEntity());

      expect(mockSchema.hasTable).toHaveBeenCalledWith('ent_contacts');
      expect(mockSchema.createTable).toHaveBeenCalledWith('ent_contacts', expect.any(Function));
      expect(mockTableBuilder.uuid).toHaveBeenCalledWith('id');
      expect(mockTableBuilder.timestamp).toHaveBeenCalledWith('date_created', { useTz: true });
      expect(mockTableBuilder.timestamp).toHaveBeenCalledWith('date_updated', { useTz: true });
      expect(mockTableBuilder.uuid).toHaveBeenCalledWith('id_profile');
    });

    it('skip daca tabela exista deja', async () => {
      mockSchema.hasTable.mockResolvedValue(true);

      await service.createEntityTable(mockEntity());

      expect(mockSchema.createTable).not.toHaveBeenCalled();
    });

    it('adauga prefixul "ent_" daca lipseste', async () => {
      mockSchema.hasTable.mockResolvedValue(false);

      await service.createEntityTable(mockEntity({ table_name: 'projects' }));

      expect(mockSchema.hasTable).toHaveBeenCalledWith('ent_projects');
      expect(mockSchema.createTable).toHaveBeenCalledWith('ent_projects', expect.any(Function));
    });

    it('nu dubleaza prefixul "ent_" daca exista deja', async () => {
      mockSchema.hasTable.mockResolvedValue(false);

      await service.createEntityTable(mockEntity({ table_name: 'ent_contacts' }));

      expect(mockSchema.hasTable).toHaveBeenCalledWith('ent_contacts');
    });

    it('seteaza id-ul ca primary key cu default uuid', async () => {
      mockSchema.hasTable.mockResolvedValue(false);

      await service.createEntityTable(mockEntity());

      expect(mockColumnBuilder.primary).toHaveBeenCalled();
      expect(mockColumnBuilder.defaultTo).toHaveBeenCalledWith('gen_random_uuid()');
    });
  });

  // ═══════════════════════════════════════════
  //  addColumn — validare slug
  // ═══════════════════════════════════════════
  describe('addColumn — validare slug', () => {
    it('accepta slug valid: litere mici + cifre + underscore', async () => {
      mockSchema.hasColumn.mockResolvedValue(false);
      const field = mockField({ slug: 'my_field_2', is_filterable: false });

      await expect(service.addColumn(mockEntity(), field)).resolves.not.toThrow();
    });

    it('respinge slug care incepe cu cifra', async () => {
      const field = mockField({ slug: '1bad' });
      await expect(service.addColumn(mockEntity(), field)).rejects.toThrow(BadRequestException);
    });

    it('respinge slug care incepe cu underscore', async () => {
      const field = mockField({ slug: '_bad' });
      await expect(service.addColumn(mockEntity(), field)).rejects.toThrow(BadRequestException);
    });

    it('respinge slug cu litere mari', async () => {
      const field = mockField({ slug: 'BadSlug' });
      await expect(service.addColumn(mockEntity(), field)).rejects.toThrow(BadRequestException);
    });

    it('respinge slug de un singur caracter', async () => {
      const field = mockField({ slug: 'a' });
      await expect(service.addColumn(mockEntity(), field)).rejects.toThrow(BadRequestException);
    });

    it('respinge slug cu caractere speciale', async () => {
      const field = mockField({ slug: 'my-field' });
      await expect(service.addColumn(mockEntity(), field)).rejects.toThrow(BadRequestException);
    });

    it('respinge slug cu spatii', async () => {
      const field = mockField({ slug: 'my field' });
      await expect(service.addColumn(mockEntity(), field)).rejects.toThrow(BadRequestException);
    });

    it('accepta slug minim de 2 caractere', async () => {
      mockSchema.hasColumn.mockResolvedValue(false);
      const field = mockField({ slug: 'ab', is_filterable: false });
      await expect(service.addColumn(mockEntity(), field)).resolves.not.toThrow();
    });
  });

  // ═══════════════════════════════════════════
  //  addColumn — prefixare coloane
  // ═══════════════════════════════════════════
  describe('addColumn — prefixare coloane', () => {
    it('nu adauga "cf_" pe campuri system', async () => {
      mockSchema.hasColumn.mockResolvedValue(false);
      const field = mockField({
        slug: 'name',
        column_name: 'name',
        is_system: true,
        is_filterable: false,
      });

      await service.addColumn(mockEntity(), field);

      expect(mockSchema.hasColumn).toHaveBeenCalledWith('ent_contacts', 'name');
      expect(mockTableBuilder.string).toHaveBeenCalledWith('name', 255);
    });

    it('adauga "cf_" pe campuri custom fara prefix', async () => {
      mockSchema.hasColumn.mockResolvedValue(false);
      const field = mockField({ column_name: 'industry', is_filterable: false });

      await service.addColumn(mockEntity(), field);

      expect(mockSchema.hasColumn).toHaveBeenCalledWith('ent_contacts', 'cf_industry');
    });

    it('nu dubleaza "cf_" daca exista deja', async () => {
      mockSchema.hasColumn.mockResolvedValue(false);
      const field = mockField({ column_name: 'cf_industry', is_filterable: false });

      await service.addColumn(mockEntity(), field);

      expect(mockSchema.hasColumn).toHaveBeenCalledWith('ent_contacts', 'cf_industry');
    });
  });

  // ═══════════════════════════════════════════
  //  addColumn — tipuri de date
  // ═══════════════════════════════════════════
  describe('addColumn — tipuri de date', () => {
    const testDataType = (dataType: string, builderMethod: string, ...args: any[]) => {
      it(`mapeaza data_type="${dataType}" la table.${builderMethod}()`, async () => {
        mockSchema.hasColumn.mockResolvedValue(false);
        const field = mockField({
          slug: 'test_col',
          column_name: 'cf_test_col',
          data_type: dataType,
          is_filterable: false,
        });

        await service.addColumn(mockEntity(), field);

        expect(mockTableBuilder[builderMethod]).toHaveBeenCalledWith('cf_test_col', ...args);
      });
    };

    testDataType('varchar', 'string', 255);
    testDataType('text', 'text');
    testDataType('integer', 'integer');
    testDataType('numeric', 'decimal', 15, 2);
    testDataType('boolean', 'boolean');
    testDataType('datetime', 'timestamp', { useTz: true });
    testDataType('uuid', 'uuid');

    it('adauga FK spre stored_file pentru ui_type=file', async () => {
      mockSchema.hasColumn.mockResolvedValue(false);
      mockSchema.hasTable.mockResolvedValue(true);
      const field = mockField({
        column_name: 'cf_contract',
        data_type: 'uuid',
        ui_type: 'file',
        is_filterable: false,
      });

      await service.addColumn(mockEntity(), field);

      expect(mockTableBuilder.foreign).toHaveBeenCalledWith('cf_contract');
      expect(mockColumnBuilder.references).toHaveBeenCalledWith('id_file');
      expect(mockColumnBuilder.inTable).toHaveBeenCalledWith('stored_file');
      expect(mockColumnBuilder.onDelete).toHaveBeenCalledWith('RESTRICT');
    });

    it('refuza campul file daca migrarea stored_file lipseste', async () => {
      mockSchema.hasColumn.mockResolvedValue(false);
      mockSchema.hasTable.mockResolvedValue(false);

      await expect(service.addColumn(mockEntity(), mockField({
        data_type: 'uuid',
        ui_type: 'file',
        is_filterable: false,
      }))).rejects.toBeInstanceOf(BadRequestException);
    });

    it('fallback la string(255) pentru data_type necunoscut', async () => {
      mockSchema.hasColumn.mockResolvedValue(false);
      const field = mockField({
        slug: 'unknown_type',
        column_name: 'cf_unknown_type',
        data_type: 'whatever',
        is_filterable: false,
      });

      await service.addColumn(mockEntity(), field);

      expect(mockTableBuilder.string).toHaveBeenCalledWith('cf_unknown_type', 255);
    });
  });

  // ═══════════════════════════════════════════
  //  addColumn — constrangeri (required, unique, default)
  // ═══════════════════════════════════════════
  describe('addColumn — constrangeri', () => {
    it('seteaza notNullable pe campuri required', async () => {
      mockSchema.hasColumn.mockResolvedValue(false);
      const field = mockField({ is_required: true, is_filterable: false });

      await service.addColumn(mockEntity(), field);

      expect(mockColumnBuilder.notNullable).toHaveBeenCalled();
    });

    it('seteaza nullable pe campuri optionale', async () => {
      mockSchema.hasColumn.mockResolvedValue(false);
      const field = mockField({ is_required: false, is_filterable: false });

      await service.addColumn(mockEntity(), field);

      expect(mockColumnBuilder.nullable).toHaveBeenCalled();
    });

    it('seteaza unique constraint cand is_unique=true', async () => {
      mockSchema.hasColumn.mockResolvedValue(false);
      const field = mockField({ is_unique: true, is_filterable: false });

      await service.addColumn(mockEntity(), field);

      expect(mockColumnBuilder.unique).toHaveBeenCalled();
    });

    it('seteaza default value cand este definit', async () => {
      mockSchema.hasColumn.mockResolvedValue(false);
      const field = mockField({
        slug: 'status',
        column_name: 'cf_status',
        default_value: 'activ',
        is_filterable: false,
      });

      await service.addColumn(mockEntity(), field);

      expect(mockColumnBuilder.defaultTo).toHaveBeenCalledWith('activ');
    });

    it('casteaza default boolean "true" la true', async () => {
      mockSchema.hasColumn.mockResolvedValue(false);
      const field = mockField({
        slug: 'is_vip',
        column_name: 'cf_is_vip',
        data_type: 'boolean',
        default_value: 'true',
        is_filterable: false,
      });

      await service.addColumn(mockEntity(), field);

      expect(mockColumnBuilder.defaultTo).toHaveBeenCalledWith(true);
    });

    it('casteaza default integer la number', async () => {
      mockSchema.hasColumn.mockResolvedValue(false);
      const field = mockField({
        slug: 'priority',
        column_name: 'cf_priority',
        data_type: 'integer',
        default_value: '5',
        is_filterable: false,
      });

      await service.addColumn(mockEntity(), field);

      expect(mockColumnBuilder.defaultTo).toHaveBeenCalledWith(5);
    });
  });

  // ═══════════════════════════════════════════
  //  addColumn — skip coloana existenta
  // ═══════════════════════════════════════════
  describe('addColumn — coloana existenta', () => {
    it('skip daca coloana exista deja in tabela', async () => {
      mockSchema.hasColumn.mockResolvedValue(true);

      await service.addColumn(mockEntity(), mockField());

      expect(mockSchema.alterTable).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════
  //  addColumn — indexare automata
  // ═══════════════════════════════════════════
  describe('addColumn — indexare automata', () => {
    it('creeaza index B-Tree pe campuri filterable', async () => {
      mockSchema.hasColumn.mockResolvedValue(false);
      const field = mockField({ is_filterable: true });

      await service.addColumn(mockEntity(), field);

      // alterTable apelat de 2 ori: addColumn + createIndex
      expect(mockSchema.alterTable).toHaveBeenCalledTimes(2);
      expect(mockTableBuilder.index).toHaveBeenCalledWith(
        'cf_industry',
        'idx_ent_contacts_cf_industry',
      );
    });

    it('nu creeaza index pe campuri non-filterable', async () => {
      mockSchema.hasColumn.mockResolvedValue(false);
      const field = mockField({ is_filterable: false });

      await service.addColumn(mockEntity(), field);

      expect(mockSchema.alterTable).toHaveBeenCalledTimes(1);
      expect(mockTableBuilder.index).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════
  //  removeColumn
  // ═══════════════════════════════════════════
  describe('removeColumn', () => {
    it('sterge coloana pentru campuri custom', async () => {
      const field = mockField({ is_system: false });

      await service.removeColumn(mockEntity(), field);

      expect(mockSchema.alterTable).toHaveBeenCalledWith('ent_contacts', expect.any(Function));
      expect(mockTableBuilder.dropColumn).toHaveBeenCalledWith('cf_industry');
    });

    it('arunca BadRequestException pentru campuri system', async () => {
      const field = mockField({ is_system: true, name: 'Nume' });

      await expect(service.removeColumn(mockEntity(), field)).rejects.toThrow(BadRequestException);
      await expect(service.removeColumn(mockEntity(), field)).rejects.toThrow(
        /proprietate de system/,
      );
    });

    it('nu apeleaza alterTable daca campul e system', async () => {
      const field = mockField({ is_system: true });

      try {
        await service.removeColumn(mockEntity(), field);
      } catch {}

      expect(mockSchema.alterTable).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════
  //  createIndex
  // ═══════════════════════════════════════════
  describe('updateColumnRequired', () => {
    it('face coloana nullable cand campul nu mai este required', async () => {
      mockSchema.hasColumn.mockResolvedValue(true);

      await service.updateColumnRequired(
        mockEntity(),
        mockField({ is_required: true, is_filterable: false }),
        false,
      );

      expect(mockSchema.hasColumn).toHaveBeenCalledWith('ent_contacts', 'cf_industry');
      expect(mockColumnBuilder.nullable).toHaveBeenCalled();
      expect(mockColumnBuilder.alter).toHaveBeenCalled();
    });

    it('face coloana not nullable cand nu exista valori null', async () => {
      mockSchema.hasColumn.mockResolvedValue(true);
      mockQueryBuilder.first.mockResolvedValueOnce({ cnt: 0 });

      await service.updateColumnRequired(
        mockEntity(),
        mockField({ is_required: false, is_filterable: false }),
        true,
      );

      expect(mockColumnBuilder.notNullable).toHaveBeenCalled();
      expect(mockColumnBuilder.alter).toHaveBeenCalled();
    });

    it('respinge required=true daca exista deja valori null', async () => {
      mockSchema.hasColumn.mockResolvedValue(true);
      mockQueryBuilder.first.mockResolvedValueOnce({ cnt: 2 });

      await expect(
        service.updateColumnRequired(
          mockEntity(),
          mockField({ is_required: false, is_filterable: false }),
          true,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockSchema.alterTable).not.toHaveBeenCalled();
    });

    it('resincronizeaza coloana chiar daca metadata este deja optionala', async () => {
      mockSchema.hasColumn.mockResolvedValue(true);

      await service.updateColumnRequired(
        mockEntity(),
        mockField({ is_required: false, is_filterable: false }),
        false,
      );

      expect(mockSchema.hasColumn).toHaveBeenCalledWith('ent_contacts', 'cf_industry');
      expect(mockColumnBuilder.nullable).toHaveBeenCalled();
      expect(mockColumnBuilder.alter).toHaveBeenCalled();
    });
  });

  describe('createIndex', () => {
    it('creeaza index cu naming convention corecta', async () => {
      await service.createIndex('ent_contacts', 'cf_industry');

      expect(mockSchema.alterTable).toHaveBeenCalledWith('ent_contacts', expect.any(Function));
      expect(mockTableBuilder.index).toHaveBeenCalledWith(
        'cf_industry',
        'idx_ent_contacts_cf_industry',
      );
    });

    it('skip silent daca indexul exista deja', async () => {
      mockSchema.alterTable.mockImplementation(() => {
        const err: any = new Error('relation already exists');
        err.messages = 'relation already exists';
        throw err;
      });

      await expect(service.createIndex('ent_contacts', 'cf_industry')).resolves.not.toThrow();
    });

    it('propaga erorile non-duplicate', async () => {
      mockSchema.alterTable.mockImplementation(() => {
        throw new Error('connection refused');
      });

      await expect(service.createIndex('ent_contacts', 'cf_x')).rejects.toThrow(
        'connection refused',
      );
    });
  });
});
