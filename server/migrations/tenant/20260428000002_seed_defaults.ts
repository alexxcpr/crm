import { Knex } from 'knex';
import * as argon from 'argon2';

export async function up(knex: Knex): Promise<void> {
  // Seed admin role
  const [adminRole] = await knex('role').insert({
    name: 'Administrator',
    slug: 'admin',
    description: 'Full access to everything',
    is_system: true,
  }).returning('*');

  await knex('role').insert({
    name: 'User',
    slug: 'user',
    description: 'Standard user role',
    is_system: true,
  });

  // Seed default admin user (password: admin123 — change in production!)
  const hash = await argon.hash('admin123');
  const [adminUser] = await knex('user').insert({
    email: 'admin@crm.local',
    hash,
    first_name: 'Admin',
    last_name: 'CRM',
  }).returning('*');

  // Assign admin role
  await knex('user_role').insert({
    id_user: adminUser.id,
    id_role: adminRole.id_role,
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex('user_role').del();
  await knex('user').del();
  await knex('role').del();
}
