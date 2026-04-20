import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import knex from 'knex';
import * as argon2 from 'argon2';
import { applyColumn } from 'src/dynamic-schema/data-type.mapper';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const db = knex({
  client:'pg',
  connection: process.env.DATABASE_URL,
});

async function main () {
  const { adminRole } = await seedRoles();
  await seedUser(adminRole.id_role);
  await seedCRM();
}

async function seedUser(adminRoleId: string) {
  const hash = await argon2.hash('1234');
  
  const rootUser = await prisma.user.upsert({
    where: { email: 'root@gmail.com' },
    update: { hash },
    create: {
      email: 'root@gmail.com',
      hash: hash,
      first_name: 'Root',
      last_name: 'Admin',
    }
  });

  const existingUserRole = await prisma.userRole.findUnique({
    where: {
      id_user_id_role: {
        id_user: rootUser.id,
        id_role: adminRoleId,
      }
    }
  });

  if (!existingUserRole) {
    await prisma.userRole.create({
      data: {
        id_user: rootUser.id,
        id_role: adminRoleId,
      }
    });
  }

  console.log('Utilizator root creat si asociat cu rolul de admin.');
}

async function seedRoles() {
  const adminRole = await prisma.role.upsert({
    where:{
      slug: 'admin'
    },
    update: {},
    create: {
      name: 'Administrator',
      slug: 'admin',
      description: 'Acces complet la tot sistemul',
      is_system: true,
    },
  });

  const userRole = await prisma.role.upsert({
    where: {
      slug: 'user'
    },
    update: {},
    create: {
      name: 'Utilizator',
      slug: 'user',
      description: 'Acces standard de citire si editare pe entitatile permise',
      is_system: true,
    },
  });

  console.log('Roluri create:', adminRole.name, userRole.name);


  //Admin: permisiune globala "manage" (poate totul)
  await upsertPermission(adminRole.id_role, 'manage');
  await upsertPermission(userRole.id_role, 'read');

  console.log('Permisiuni create pentru admin si user');

  return { adminRole, userRole };
}

async function upsertPermission(id_role: string, action: string, id_module: string | null = null, id_entity: string | null = null) {
  const existing = await prisma.rolePermission.findFirst({
    where: {
      id_role, 
      id_module, 
      id_entity, 
      action,
    },
  });

  if (!existing) {
    await prisma.rolePermission.create({
      data: {
        id_role, 
        id_module,
        id_entity,
        action,
      }
    })
  }
}

/** Entitate sandbox: toate tipurile SQL suportate, toate tipurile UI și ~10 taburi (group_name) pentru testare form/listă. */
async function seedTestEntity(id_module: string, id_relation_target: string) {
  const testEntity = await prisma.entity.upsert({
    where: { slug: 'test_entity' },
    update: {
      id_module,
      name: 'Test entity',
      table_name: 'ent_test_entity',
      icon: 'i-heroicons-beaker',
      label_singular: 'Înregistrare test',
      label_plural: 'Test entity',
      rank: 3,
    },
    create: {
      id_module,
      name: 'Test entity',
      slug: 'test_entity',
      table_name: 'ent_test_entity',
      icon: 'i-heroicons-beaker',
      is_system: false,
      label_singular: 'Înregistrare test',
      label_plural: 'Test entity',
      rank: 3,
    },
  });

  const selOpts = [
    { label: 'Opțiune Alfa', value: 'opt_a' },
    { label: 'Opțiune Beta', value: 'opt_b' },
    { label: 'Opțiune Gamma', value: 'opt_c' },
  ];

  const multiOpts = [
    { label: 'Tag roșu', value: 'red' },
    { label: 'Tag verde', value: 'green' },
    { label: 'Tag albastru', value: 'blue' },
    { label: 'Tag galben', value: 'yellow' },
  ];

  const testFields: Array<Record<string, unknown>> = [
    // ── Tab 1: varchar × mai multe UI ──
    {
      name: 'Varchar → text',
      slug: 'vc_text',
      column_name: 'cf_test_vc_text',
      data_type: 'varchar',
      ui_type: 'text',
      is_required: false,
      is_system: false,
      placeholder: 'Text scurt',
      group_name: 'test_tab_01_varchar',
      rank: 1,
      grid_col: 1,
      col_span: 1,
    },
    {
      name: 'Varchar → email',
      slug: 'vc_email',
      column_name: 'cf_test_vc_email',
      data_type: 'varchar',
      ui_type: 'email',
      is_required: false,
      is_system: false,
      group_name: 'test_tab_01_varchar',
      rank: 2,
      grid_col: 2,
      col_span: 1,
    },
    {
      name: 'Varchar → phone',
      slug: 'vc_phone',
      column_name: 'cf_test_vc_phone',
      data_type: 'varchar',
      ui_type: 'phone',
      is_required: false,
      is_system: false,
      group_name: 'test_tab_01_varchar',
      rank: 3,
      grid_col: 3,
      col_span: 1,
    },
    {
      name: 'Varchar → file (URL)',
      slug: 'vc_file',
      column_name: 'cf_test_vc_file',
      data_type: 'varchar',
      ui_type: 'file',
      is_required: false,
      is_system: false,
      placeholder: 'Cale sau URL fișier',
      group_name: 'test_tab_01_varchar',
      rank: 4,
      grid_col: 1,
      col_span: 2,
    },
    {
      name: 'Varchar → number (input numeric)',
      slug: 'vc_number',
      column_name: 'cf_test_vc_number',
      data_type: 'varchar',
      ui_type: 'number',
      is_required: false,
      is_system: false,
      placeholder: 'Stocat ca text în DB',
      group_name: 'test_tab_01_varchar',
      rank: 5,
      grid_col: 3,
      col_span: 1,
    },
    {
      name: 'Varchar → textarea',
      slug: 'vc_textarea',
      column_name: 'cf_test_vc_textarea',
      data_type: 'varchar',
      ui_type: 'textarea',
      is_required: false,
      is_system: false,
      placeholder: 'Text mai lung în coloană varchar(255)',
      group_name: 'test_tab_01_varchar',
      rank: 6,
      grid_col: 1,
      col_span: 3,
    },

    // ── Tab 2: text SQL ──
    {
      name: 'Text → textarea',
      slug: 'txt_textarea',
      column_name: 'cf_test_txt_textarea',
      data_type: 'text',
      ui_type: 'textarea',
      is_required: false,
      is_system: false,
      group_name: 'test_tab_02_text',
      rank: 1,
      grid_col: 1,
      col_span: 3,
    },
    {
      name: 'Text → text (single line)',
      slug: 'txt_text',
      column_name: 'cf_test_txt_text',
      data_type: 'text',
      ui_type: 'text',
      is_required: false,
      is_system: false,
      group_name: 'test_tab_02_text',
      rank: 2,
      grid_col: 1,
      col_span: 2,
    },

    // ── Tab 3: numerice ──
    {
      name: 'Integer → number',
      slug: 'int_number',
      column_name: 'cf_test_int_number',
      data_type: 'integer',
      ui_type: 'number',
      is_required: false,
      is_system: false,
      validation_rules: { min: 0, max: 999999 },
      group_name: 'test_tab_03_numeric',
      rank: 1,
      grid_col: 1,
      col_span: 1,
    },
    {
      name: 'Numeric → number',
      slug: 'num_number',
      column_name: 'cf_test_num_number',
      data_type: 'numeric',
      ui_type: 'number',
      is_required: false,
      is_system: false,
      group_name: 'test_tab_03_numeric',
      rank: 2,
      grid_col: 2,
      col_span: 1,
    },
    {
      name: 'Numeric → currency',
      slug: 'num_currency',
      column_name: 'cf_test_num_currency',
      data_type: 'numeric',
      ui_type: 'currency',
      is_required: false,
      is_system: false,
      group_name: 'test_tab_03_numeric',
      rank: 3,
      grid_col: 3,
      col_span: 1,
    },

    // ── Tab 4: boolean ──
    {
      name: 'Boolean → checkbox',
      slug: 'bool_checkbox',
      column_name: 'cf_test_bool_checkbox',
      data_type: 'boolean',
      ui_type: 'checkbox',
      is_required: true,
      is_system: false,
      default_value: 'false',
      group_name: 'test_tab_04_boolean',
      rank: 1,
      grid_col: 1,
      col_span: 1,
    },

    // ── Tab 5: date ──
    {
      name: 'Date → datepicker',
      slug: 'dt_date',
      column_name: 'cf_test_dt_date',
      data_type: 'date',
      ui_type: 'datepicker',
      is_required: false,
      is_system: false,
      group_name: 'test_tab_05_date',
      rank: 1,
      grid_col: 1,
      col_span: 1,
    },

    // ── Tab 6: timestamp ──
    {
      name: 'Timestamp → datepicker',
      slug: 'ts_datetime',
      column_name: 'cf_test_ts_datetime',
      data_type: 'timestamp',
      ui_type: 'datepicker',
      is_required: false,
      is_system: false,
      group_name: 'test_tab_06_timestamp',
      rank: 1,
      grid_col: 1,
      col_span: 2,
    },

    // ── Tab 7: select & radio ──
    {
      name: 'Varchar → select',
      slug: 'vc_select',
      column_name: 'cf_test_vc_select',
      data_type: 'varchar',
      ui_type: 'select',
      is_required: false,
      is_system: false,
      options: selOpts,
      group_name: 'test_tab_07_choice',
      rank: 1,
      grid_col: 1,
      col_span: 1,
    },
    {
      name: 'Varchar → radio',
      slug: 'vc_radio',
      column_name: 'cf_test_vc_radio',
      data_type: 'varchar',
      ui_type: 'radio',
      is_required: false,
      is_system: false,
      options: selOpts,
      group_name: 'test_tab_07_choice',
      rank: 2,
      grid_col: 2,
      col_span: 2,
    },

    // ── Tab 8: multi-select (JSON în DB) ──
    {
      name: 'JSONB → multi-select',
      slug: 'json_multi',
      column_name: 'cf_test_json_multi',
      data_type: 'jsonb',
      ui_type: 'multi-select',
      is_required: false,
      is_system: false,
      options: multiOpts,
      group_name: 'test_tab_08_multi',
      rank: 1,
      grid_col: 1,
      col_span: 3,
    },

    // ── Tab 9: UUID + relație ──
    {
      name: 'UUID → text (manual)',
      slug: 'uuid_text',
      column_name: 'cf_test_uuid_text',
      data_type: 'uuid',
      ui_type: 'text',
      is_required: false,
      is_system: false,
      placeholder: '00000000-0000-0000-0000-000000000000',
      group_name: 'test_tab_09_uuid',
      rank: 1,
      grid_col: 1,
      col_span: 2,
    },
    {
      name: 'Relație → companie',
      slug: 'rel_company',
      column_name: 'cf_test_rel_company',
      data_type: 'uuid',
      ui_type: 'relation',
      is_required: false,
      is_system: false,
      id_relation_entity: id_relation_target,
      relation_display_field: 'name',
      group_name: 'test_tab_09_uuid',
      rank: 2,
      grid_col: 3,
      col_span: 1,
    },

    // ── Tab 10: JSON + unic ──
    {
      name: 'JSONB → text (JSON ca string)',
      slug: 'json_text',
      column_name: 'cf_test_json_text',
      data_type: 'jsonb',
      ui_type: 'text',
      is_required: false,
      is_system: false,
      placeholder: '{"exemplu": true}',
      group_name: 'test_tab_10_json',
      rank: 1,
      grid_col: 1,
      col_span: 2,
    },
    {
      name: 'Varchar unic (constraint)',
      slug: 'vc_unique',
      column_name: 'cf_test_vc_unique',
      data_type: 'varchar',
      ui_type: 'text',
      is_required: false,
      is_unique: true,
      is_system: false,
      placeholder: 'Valoare unică per rând',
      group_name: 'test_tab_10_json',
      rank: 2,
      grid_col: 3,
      col_span: 1,
    },
  ];

  for (const field of testFields) {
    const slug = field.slug as string;
    const created = await prisma.field.upsert({
      where: {
        id_entity_slug: {
          id_entity: testEntity.id_entity,
          slug,
        },
      },
      update: {
        name: field.name as string,
        column_name: field.column_name as string,
        data_type: field.data_type as string,
        ui_type: field.ui_type as string,
        default_value: (field.default_value as string | undefined) ?? null,
        placeholder: (field.placeholder as string | undefined) ?? null,
        options: (field.options as object | undefined) ?? undefined,
        is_required: field.is_required as boolean,
        is_unique: (field.is_unique as boolean | undefined) ?? false,
        is_system: field.is_system as boolean,
        validation_rules: (field.validation_rules as object | undefined) ?? undefined,
        id_relation_entity: (field.id_relation_entity as string | undefined) ?? null,
        relation_display_field: (field.relation_display_field as string | undefined) ?? null,
        group_name: field.group_name as string,
        rank: field.rank as number,
        grid_col: field.grid_col as number,
        col_span: field.col_span as number,
      },
      create: {
        id_entity: testEntity.id_entity,
        name: field.name as string,
        slug,
        column_name: field.column_name as string,
        data_type: field.data_type as string,
        ui_type: field.ui_type as string,
        default_value: (field.default_value as string | undefined) ?? null,
        placeholder: (field.placeholder as string | undefined) ?? null,
        options: (field.options as object | undefined) ?? undefined,
        is_required: field.is_required as boolean,
        is_unique: (field.is_unique as boolean | undefined) ?? false,
        is_system: field.is_system as boolean,
        validation_rules: (field.validation_rules as object | undefined) ?? undefined,
        id_relation_entity: (field.id_relation_entity as string | undefined) ?? null,
        relation_display_field: (field.relation_display_field as string | undefined) ?? null,
        group_name: field.group_name as string,
        rank: field.rank as number,
        grid_col: field.grid_col as number,
        col_span: field.col_span as number,
      },
    });
    console.log(`[test_entity] Field: ${created.name} (${created.column_name})`);
  }

  console.log('Entitate test_entity si campurile ei au fost definite.');
}

async function seedCRM() {
  // 1. Modulul CRM
  const crmModule = await prisma.module.upsert({
    where: { slug: 'crm' },
    update: {},
    create: {
      name: 'CRM',
      slug: 'crm',
      icon: 'i-heroicons-users',
      rank: 1,
      is_active: true,
    },
  });

  console.log('Modul creat:', crmModule.name);

  // 2. Entitatea Contacts
  const contactsEntity = await prisma.entity.upsert({
    where: { slug: 'contacts' },
    update: {},
    create: {
      id_module: crmModule.id_module,
      name: 'Contacte',
      slug: 'contacts',
      table_name: 'ent_contacts',
      icon: 'i-heroicons-user-group',
      is_system: true,
      label_singular: 'Contact',
      label_plural: 'Contacte',
      rank: 1,
    },
  });

  console.log('Entitate creata:', contactsEntity.name);

  // 3. Entitatea Companies
  const companiesEntity = await prisma.entity.upsert({
    where: { slug: 'companies' },
    update: {},
    create: {
      id_module: crmModule.id_module,
      name: 'Companii',
      slug: 'companies',
      table_name: 'ent_companies',
      icon: 'i-heroicons-building-office',
      is_system: true,
      label_singular: 'Companie',
      label_plural: 'Companii',
      rank: 2,
    },
  });

  console.log('Entitate creata:', companiesEntity.name);

  // 4. Field definitions pentru Contacts
  const contactFields = [
    {
      name: 'Nume',
      slug: 'nume',
      column_name: 'nume',
      data_type: 'varchar',
      ui_type: 'text',
      is_required: true,
      is_system: true,
      placeholder: 'Introduceti numele',
      validation_rules: { min_length: 2, max_length: 100 },
      group_name: 'general',
      rank: 1,
      grid_col: 1,
      col_span: 1,
    },
    {
      name: 'Prenume',
      slug: 'prenume',
      column_name: 'prenume',
      data_type: 'varchar',
      ui_type: 'text',
      is_required: true,
      is_system: true,
      placeholder: 'Introduceti prenumele',
      validation_rules: { min_length: 2, max_length: 100 },
      group_name: 'general',
      rank: 2,
      grid_col: 2,
      col_span: 1,
    },
    {
      name: 'Email companie',
      slug: 'email_companie',
      column_name: 'email_companie',
      data_type: 'varchar',
      ui_type: 'email',
      is_required: true,
      is_system: true,
      placeholder: 'email@companie.ro',
      validation_rules: { max_length: 255 },
      group_name: 'general',
      rank: 3,
      grid_col: 3,
      col_span: 1,
    },
    {
      name: 'Pozitie',
      slug: 'pozitie',
      column_name: 'pozitie',
      data_type: 'varchar',
      ui_type: 'text',
      is_required: false,
      is_system: true,
      placeholder: 'Ex: Director Vanzari',
      group_name: 'general',
      rank: 4,
      grid_col: 1,
      col_span: 1,
    },
    {
      name: 'Activ',
      slug: 'is_activ',
      column_name: 'is_activ',
      data_type: 'boolean',
      ui_type: 'checkbox',
      is_required: true,
      is_system: true,
      default_value: 'true',
      group_name: 'general',
      rank: 5,
      grid_col: 2,
      col_span: 1,
    },
    {
      name: 'Decision Maker',
      slug: 'is_decision_maker',
      column_name: 'is_decision_maker',
      data_type: 'boolean',
      ui_type: 'checkbox',
      is_required: false,
      is_system: true,
      group_name: 'general',
      rank: 6,
      grid_col: 3,
      col_span: 1,
    },
    {
      name: 'Telefon 1',
      slug: 'telefon1',
      column_name: 'telefon1',
      data_type: 'varchar',
      ui_type: 'phone',
      is_required: false,
      is_system: true,
      placeholder: '+40 7XX XXX XXX',
      group_name: 'contact_info',
      rank: 1,
      grid_col: 1,
      col_span: 1,
    },
    {
      name: 'Telefon 2',
      slug: 'telefon2',
      column_name: 'telefon2',
      data_type: 'varchar',
      ui_type: 'phone',
      is_required: false,
      is_system: true,
      placeholder: '+40 7XX XXX XXX',
      group_name: 'contact_info',
      rank: 2,
      grid_col: 2,
      col_span: 1,
    },
    {
      name: 'Email alternativ',
      slug: 'email_alternativ',
      column_name: 'email_alternativ',
      data_type: 'varchar',
      ui_type: 'email',
      is_required: false,
      is_system: true,
      placeholder: 'email@personal.ro',
      group_name: 'contact_info',
      rank: 3,
      grid_col: 3,
      col_span: 1,
    },
    {
      name: 'Profil LinkedIn',
      slug: 'profile_linkedin',
      column_name: 'profile_linkedin',
      data_type: 'varchar',
      ui_type: 'text',
      is_required: false,
      is_system: true,
      placeholder: 'https://linkedin.com/in/...',
      validation_rules: { max_length: 500 },
      group_name: 'contact_info',
      rank: 4,
      grid_col: 1,
      col_span: 3,
    },
  ];

  for (const field of contactFields) {
    const created = await prisma.field.upsert({
      where: {
        id_entity_slug: {
          id_entity: contactsEntity.id_entity,
          slug: field.slug,
        },
      },
      update: {},
      create: {
        id_entity: contactsEntity.id_entity,
        ...field,
      },
    });
    console.log(`Field creat: ${created.name} (${created.column_name})`);
  }

  // 5. Field definitions pentru Companies
  const companyFields = [
    {
      name: 'Nume companie',
      slug: 'name',
      column_name: 'name',
      data_type: 'varchar',
      ui_type: 'text',
      is_required: true,
      is_system: true,
      placeholder: 'Introduceti numele companiei',
      validation_rules: { min_length: 2, max_length: 200 },
      group_name: 'general',
      rank: 1,
      grid_col: 1,
      col_span: 1,
    },
    {
      name: 'CUI',
      slug: 'cui',
      column_name: 'cui',
      data_type: 'varchar',
      ui_type: 'text',
      is_required: false,
      is_system: true,
      placeholder: 'RO12345678',
      is_unique: true,
      group_name: 'general',
      rank: 2,
      grid_col: 2,
      col_span: 1,
    },
    {
      name: 'Industrie',
      slug: 'industry',
      column_name: 'cf_industry',
      data_type: 'varchar',
      ui_type: 'select',
      is_required: false,
      is_system: false,
      options: [
        { label: 'IT & Software', value: 'it' },
        { label: 'Finance & Banking', value: 'finance' },
        { label: 'Sanatate', value: 'health' },
        { label: 'Productie', value: 'manufacturing' },
        { label: 'Retail', value: 'retail' },
        { label: 'Constructii', value: 'construction' },
        { label: 'Altele', value: 'other' },
      ],
      group_name: 'general',
      rank: 3,
      grid_col: 3,
      col_span: 1,
    },
    {
      name: 'Website',
      slug: 'website',
      column_name: 'website',
      data_type: 'varchar',
      ui_type: 'text',
      is_required: false,
      is_system: true,
      placeholder: 'https://www.exemplu.ro',
      group_name: 'contact_info',
      rank: 1,
      grid_col: 1,
      col_span: 1,
    },
    {
      name: 'Telefon',
      slug: 'phone',
      column_name: 'phone',
      data_type: 'varchar',
      ui_type: 'phone',
      is_required: false,
      is_system: true,
      placeholder: '+40 XXX XXX XXX',
      group_name: 'contact_info',
      rank: 2,
      grid_col: 2,
      col_span: 1,
    },
    {
      name: 'Adresa',
      slug: 'address',
      column_name: 'address',
      data_type: 'text',
      ui_type: 'textarea',
      is_required: false,
      is_system: true,
      placeholder: 'Strada, numar, oras, judet',
      group_name: 'contact_info',
      rank: 3,
      grid_col: 1,
      col_span: 3,
    },
  ];

  for (const field of companyFields) {
    const created = await prisma.field.upsert({
      where: {
        id_entity_slug: {
          id_entity: companiesEntity.id_entity,
          slug: field.slug,
        },
      },
      update: {},
      create: {
        id_entity: companiesEntity.id_entity,
        ...field,
      },
    });
    console.log(`Field creat: ${created.name} (${created.column_name})`);
  }

  await seedTestEntity(crmModule.id_module, companiesEntity.id_entity);

  console.log('Fielduri create cu succes (finish prisma)')

  console.log('Conectare la Knex + incepere creare tabele dinamic')

  const entities = await prisma.entity.findMany();

  for (const entity of entities) {
    // Creează tabela cu coloanele sistem (id, date_created, etc.)
    if (!(await db.schema.hasTable(entity.table_name))) {
      await db.schema.createTable(entity.table_name, (table) => {
        table.uuid('id').primary().defaultTo(db.fn.uuid());
        table.timestamp('date_created', { useTz: true }).notNullable().defaultTo(db.fn.now());
        table.timestamp('date_updated', { useTz: true }).notNullable().defaultTo(db.fn.now());
        table.uuid('id_owner').nullable();
        table.jsonb('extra_data').defaultTo('{}');
      });
      console.log(`Tabela "${entity.table_name}" creata.`);
    }

    // Adaugă coloanele din field definitions
    const fields = await prisma.field.findMany({
      where: { id_entity: entity.id_entity },
      orderBy: { rank: 'asc' },
    });

    for (const field of fields) {
      if (!(await db.schema.hasColumn(entity.table_name, field.column_name))) {
        await db.schema.alterTable(entity.table_name, (table) => {
          applyColumn(table, {
            columnName: field.column_name,
            dataType: field.data_type,
            isRequired: field.is_required,
            isUnique: field.is_unique,
            defaultValue: field.default_value,
          });
        });
        console.log(`  Coloana "${field.column_name}" adaugata in "${entity.table_name}".`);
      }
    }
  }

  console.log('\nSeed complet!');
}

main()
  .catch((e) => {
    console.error('Eroare la seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
    await db.destroy();
  });