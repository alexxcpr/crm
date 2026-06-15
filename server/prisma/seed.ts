/**
 * Seed script — Knex only, no Prisma.
 * Usage: npx tsx prisma/seed.ts   (or via npm run db:seed)
 *
 * Runs AFTER Knex migrations (which create user, role, module, entity, field tables).
 * Seeds CRM module, entities, fields, then creates dynamic ent_* tables + columns.
 */
import 'dotenv/config';
import knex from 'knex';
import * as argon2 from 'argon2';
import { applyColumn } from '../src/dynamic-schema/data-type.mapper';

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL,
});

async function main() {
  const { adminRoleId, userRoleId } = await seedRoles();
  await seedUser(adminRoleId);
  await seedCRM();
  const entities = await db('entity').select('id_entity');
  for (const entity of entities) {
    await upsertPermission(adminRoleId, entity.id_entity, 'manage', 'all');
    await upsertPermission(userRoleId, entity.id_entity, 'read', 'owner');
    await upsertPermission(userRoleId, entity.id_entity, 'create', null);
    await upsertPermission(userRoleId, entity.id_entity, 'update', 'owner');
  }
}

async function seedUser(adminRoleId: string) {
  const hash = await argon2.hash('1234');

  let user = await db('user').where('login_username', 'root').first();
  if (!user) {
    [user] = await db('user')
      .insert({ login_username: 'root', hash, must_change_password: false, is_active: true })
      .returning('*');
    await db('profile').insert({ id_profile: user.id, id_user: user.id, username: 'root', email: 'root@gmail.com', display_name: 'Root Admin', is_default: true });
  } else {
    await db('user').where('id', user.id).update({ hash });
  }

  const profile = await db('profile').where('id_user', user.id).first();
  const exists = await db('profile_role')
    .where({ id_profile: profile.id_profile, id_role: adminRoleId })
    .first();
  if (!exists) {
    await db('profile_role').insert({ id_profile: profile.id_profile, id_role: adminRoleId });
  }

  console.log('Utilizator root creat si asociat cu rolul de admin.');
}

async function seedRoles() {
  const adminRole = await upsertRole('admin', 'Administrator', 'Acces complet la tot sistemul', true);
  const userRole = await upsertRole('user', 'Utilizator', 'Acces standard de citire si editare', true);

  console.log('Roluri create:', adminRole.name, userRole.name);


  return { adminRoleId: adminRole.id_role, userRoleId: userRole.id_role };
}

async function upsertRole(slug: string, name: string, description: string, isSystem: boolean) {
  let role = await db('role').where('slug', slug).first();
  if (!role) {
    [role] = await db('role')
      .insert({ name, slug, description, is_system: isSystem })
      .returning('*');
  }
  return role;
}

async function upsertPermission(idRole: string, idEntity: string, action: string, scope: 'all' | 'owner' | null) {
  const where = { id_role: idRole, id_entity: idEntity, action };

  const exists = await db('role_permission').where(where).first();
  if (!exists) {
    await db('role_permission').insert({ ...where, scope });
  }
}

async function upsertEntity(slug: string, data: Record<string, any>) {
  let entity = await db('entity').where('slug', slug).first();
  if (!entity) {
    [entity] = await db('entity').insert({ slug, ...data }).returning('*');
  }
  return entity;
}

async function upsertTab(idEntity: string, slug: string, data: Record<string, any>) {
  let tab = await db('ui_tab').where({ id_entity: idEntity, slug }).first();
  if (!tab) {
    [tab] = await db('ui_tab').insert({ id_entity: idEntity, slug, ...data }).returning('*');
  }
  return tab;
}

async function upsertField(idEntity: string, slug: string, data: Record<string, any>) {
  let field = await db('field').where({ id_entity: idEntity, slug }).first();
  if (!field) {
    [field] = await db('field')
      .insert({
        id_entity: idEntity,
        slug,
        ...data,
        options: data.options ? JSON.stringify(data.options) : null,
        validation_rules: data.validation_rules ? JSON.stringify(data.validation_rules) : null,
      })
      .returning('*');
  }
  return field;
}

async function seedCRM() {
  // 1. Module CRM
  let crmModule = await db('module').where('slug', 'crm').first();
  if (!crmModule) {
    [crmModule] = await db('module')
      .insert({ name: 'CRM', slug: 'crm', icon: 'i-heroicons-users', rank: 1, is_active: true })
      .returning('*');
  }
  console.log('Modul creat:', crmModule.name);

  // 2. Entities
  const contactsEntity = await upsertEntity('contacts', {
    id_module: crmModule.id_module,
    name: 'Contacte',
    table_name: 'ent_contacts',
    icon: 'i-heroicons-user-group',
    is_system: true,
    label_singular: 'Contact',
    label_plural: 'Contacte',
    rank: 1,
  });

  const companiesEntity = await upsertEntity('companies', {
    id_module: crmModule.id_module,
    name: 'Companii',
    table_name: 'ent_companies',
    icon: 'i-heroicons-building-office',
    is_system: true,
    label_singular: 'Companie',
    label_plural: 'Companii',
    rank: 2,
  });

  console.log('Entitati create:', contactsEntity.name, companiesEntity.name);

  // 3. Create tabs for entities
  const contactsGeneralTab = await upsertTab(contactsEntity.id_entity, 'general', {
    name: 'General', rank: 0, is_system: true,
  });
  const contactsInfoTab = await upsertTab(contactsEntity.id_entity, 'contact_info', {
    name: 'Informatii contact', rank: 1, is_system: false,
  });
  const companiesGeneralTab = await upsertTab(companiesEntity.id_entity, 'general', {
    name: 'General', rank: 0, is_system: true,
  });
  const companiesInfoTab = await upsertTab(companiesEntity.id_entity, 'contact_info', {
    name: 'Informatii contact', rank: 1, is_system: false,
  });
  console.log('Tab-uri create.');

  // 4. Contact fields
  const contactFields = [
    { name: 'Nume', slug: 'nume', column_name: 'nume', data_type: 'varchar', ui_type: 'text', is_required: true, is_system: true, placeholder: 'Introduceti numele', validation_rules: { min_length: 2, max_length: 100 }, id_ui_tab: contactsGeneralTab.id_ui_tab, rank: 1, grid_col: 1, col_span: 1 },
    { name: 'Prenume', slug: 'prenume', column_name: 'prenume', data_type: 'varchar', ui_type: 'text', is_required: true, is_system: true, placeholder: 'Introduceti prenumele', validation_rules: { min_length: 2, max_length: 100 }, id_ui_tab: contactsGeneralTab.id_ui_tab, rank: 2, grid_col: 2, col_span: 1 },
    { name: 'Email companie', slug: 'email_companie', column_name: 'email_companie', data_type: 'varchar', ui_type: 'email', is_required: true, is_system: true, placeholder: 'email@companie.ro', validation_rules: { max_length: 255 }, id_ui_tab: contactsGeneralTab.id_ui_tab, rank: 3, grid_col: 3, col_span: 1 },
    { name: 'Pozitie', slug: 'pozitie', column_name: 'pozitie', data_type: 'varchar', ui_type: 'text', is_required: false, is_system: true, placeholder: 'Ex: Director Vanzari', id_ui_tab: contactsGeneralTab.id_ui_tab, rank: 4, grid_col: 1, col_span: 1 },
    { name: 'Activ', slug: 'is_activ', column_name: 'is_activ', data_type: 'boolean', ui_type: 'checkbox', is_required: true, is_system: true, default_value: 'true', id_ui_tab: contactsGeneralTab.id_ui_tab, rank: 5, grid_col: 2, col_span: 1 },
    { name: 'Decision Maker', slug: 'is_decision_maker', column_name: 'is_decision_maker', data_type: 'boolean', ui_type: 'checkbox', is_required: false, is_system: true, id_ui_tab: contactsGeneralTab.id_ui_tab, rank: 6, grid_col: 3, col_span: 1 },
    { name: 'Telefon 1', slug: 'telefon1', column_name: 'telefon1', data_type: 'varchar', ui_type: 'phone', is_required: false, is_system: true, placeholder: '+40 7XX XXX XXX', id_ui_tab: contactsInfoTab.id_ui_tab, rank: 1, grid_col: 1, col_span: 1 },
    { name: 'Telefon 2', slug: 'telefon2', column_name: 'telefon2', data_type: 'varchar', ui_type: 'phone', is_required: false, is_system: true, placeholder: '+40 7XX XXX XXX', id_ui_tab: contactsInfoTab.id_ui_tab, rank: 2, grid_col: 2, col_span: 1 },
    { name: 'Email alternativ', slug: 'email_alternativ', column_name: 'email_alternativ', data_type: 'varchar', ui_type: 'email', is_required: false, is_system: true, placeholder: 'email@personal.ro', id_ui_tab: contactsInfoTab.id_ui_tab, rank: 3, grid_col: 3, col_span: 1 },
    { name: 'Profil LinkedIn', slug: 'profile_linkedin', column_name: 'profile_linkedin', data_type: 'varchar', ui_type: 'text', is_required: false, is_system: true, placeholder: 'https://linkedin.com/in/...', validation_rules: { max_length: 500 }, id_ui_tab: contactsInfoTab.id_ui_tab, rank: 4, grid_col: 1, col_span: 3 },
  ];

  for (const f of contactFields) {
    const created = await upsertField(contactsEntity.id_entity, f.slug, f);
    console.log(`  Field: ${created.name} (${created.column_name})`);
  }

  // 5. Company fields
  const companyFields = [
    { name: 'Nume companie', slug: 'name', column_name: 'name', data_type: 'varchar', ui_type: 'text', is_required: true, is_system: true, placeholder: 'Introduceti numele companiei', validation_rules: { min_length: 2, max_length: 200 }, id_ui_tab: companiesGeneralTab.id_ui_tab, rank: 1, grid_col: 1, col_span: 1 },
    { name: 'CUI', slug: 'cui', column_name: 'cui', data_type: 'varchar', ui_type: 'text', is_required: false, is_system: true, placeholder: 'RO12345678', is_unique: true, id_ui_tab: companiesGeneralTab.id_ui_tab, rank: 2, grid_col: 2, col_span: 1 },
    { name: 'Industrie', slug: 'industry', column_name: 'cf_industry', data_type: 'varchar', ui_type: 'text', is_required: false, is_system: false, placeholder: 'ex: IT & Software', id_ui_tab: companiesGeneralTab.id_ui_tab, rank: 3, grid_col: 3, col_span: 1 },
    { name: 'Website', slug: 'website', column_name: 'website', data_type: 'varchar', ui_type: 'text', is_required: false, is_system: true, placeholder: 'https://www.exemplu.ro', id_ui_tab: companiesInfoTab.id_ui_tab, rank: 1, grid_col: 1, col_span: 1 },
    { name: 'Telefon', slug: 'phone', column_name: 'phone', data_type: 'varchar', ui_type: 'phone', is_required: false, is_system: true, placeholder: '+40 XXX XXX XXX', id_ui_tab: companiesInfoTab.id_ui_tab, rank: 2, grid_col: 2, col_span: 1 },
    { name: 'Adresa', slug: 'address', column_name: 'address', data_type: 'text', ui_type: 'textarea', is_required: false, is_system: true, placeholder: 'Strada, numar, oras, judet', id_ui_tab: companiesInfoTab.id_ui_tab, rank: 3, grid_col: 1, col_span: 3 },
  ];

  for (const f of companyFields) {
    const created = await upsertField(companiesEntity.id_entity, f.slug, f);
    console.log(`  Field: ${created.name} (${created.column_name})`);
  }

  // 6. Create dynamic ent_* tables + columns
  console.log('\nCreare tabele dinamice...');
  const entities = await db('entity').select('*');

  for (const entity of entities) {
    if (!(await db.schema.hasTable(entity.table_name))) {
      await db.schema.createTable(entity.table_name, (table) => {
        table.uuid('id').primary().defaultTo(db.fn.uuid());
        table.timestamp('date_created', { useTz: true }).notNullable().defaultTo(db.fn.now());
        table.timestamp('date_updated', { useTz: true }).notNullable().defaultTo(db.fn.now());
        table.uuid('id_profile').nullable().references('id_profile').inTable('profile').onDelete('RESTRICT');
      });
      console.log(`  Tabela "${entity.table_name}" creata.`);
    }

    const fields = await db('field')
      .where('id_entity', entity.id_entity)
      .orderBy('rank', 'asc');

    for (const field of fields) {
      if (!(await db.schema.hasColumn(entity.table_name, field.column_name))) {
        await db.schema.alterTable(entity.table_name, (table) => {
          applyColumn(table, {
            columnName: field.column_name,
            dataType: field.data_type,
            isRequired: field.is_required,
            isUnique: field.is_unique ?? false,
            defaultValue: field.default_value,
          });
        });
        console.log(`    Coloana "${field.column_name}" adaugata in "${entity.table_name}".`);
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
    await db.destroy();
  });
