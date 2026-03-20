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

async function seedCRM() {
  // 1. Modulul CRM
  const crmModule = await prisma.module.upsert({
    where: { slug: 'crm' },
    update: {},
    create: {
      name: 'CRM',
      slug: 'crm',
      icon: 'i-heroicons-users',
      rank: 0,
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
      rank: 0,
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
      rank: 1,
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
      rank: 0,
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
      rank: 1,
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
      rank: 2,
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
      rank: 3,
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
      rank: 4,
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
      rank: 5,
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
      rank: 0,
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
      rank: 1,
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
      rank: 2,
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
      rank: 3,
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
      rank: 0,
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
      rank: 1,
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
      rank: 2,
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
      rank: 0,
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
      rank: 1,
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
      rank: 2,
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