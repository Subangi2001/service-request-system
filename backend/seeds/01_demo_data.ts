import type { Knex } from 'knex';
import { hashPassword } from '../src/utils/password';

// Demo data required by the assessment (PDF section 5.1):
// 1 System Admin, 2 organizations, 2 managers (one per organization) and 4 developers (two per organization).
// All demo accounts share ONE password, taken from SEED_PASSWORD in your .env file.
// Run it with: npm run db:seed   (safe to run twice: it skips if the demo data already exists)

const ORGANIZATIONS = ['Northwind Traders', 'Contoso Ltd'];

type DemoUser = { name: string; email: string; role: 'system_admin' | 'manager' | 'developer'; organization: string | null };

const USERS: DemoUser[] = [
  { name: 'System Admin', email: 'admin@servicedesk.test', role: 'system_admin', organization: null },

  { name: 'Nimal Perera', email: 'nimal.manager@northwind.test', role: 'manager', organization: 'Northwind Traders' },
  { name: 'Kamal Silva', email: 'kamal.dev@northwind.test', role: 'developer', organization: 'Northwind Traders' },
  { name: 'Sanduni Fernando', email: 'sanduni.dev@northwind.test', role: 'developer', organization: 'Northwind Traders' },

  { name: 'Ayesha Rahman', email: 'ayesha.manager@contoso.test', role: 'manager', organization: 'Contoso Ltd' },
  { name: 'Ruwan Jayasinghe', email: 'ruwan.dev@contoso.test', role: 'developer', organization: 'Contoso Ltd' },
  { name: 'Meera Kumar', email: 'meera.dev@contoso.test', role: 'developer', organization: 'Contoso Ltd' },
];

export async function seed(knex: Knex): Promise<void> {
  const password = process.env.SEED_PASSWORD?.trim();
  if (!password || password.length < 8) {
    throw new Error(
      'SEED_PASSWORD is missing or shorter than 8 characters. Add a line like SEED_PASSWORD=ChooseAPassword123 to backend/.env and try again.'
    );
  }

  // Do not seed twice.
  const existing = await knex('organizations').whereIn('name', ORGANIZATIONS).first();
  if (existing) {
    console.log('Demo data already exists. Nothing was changed.');
    console.log('To start fresh: npm run db:rollback, then npm run db:migrate, then npm run db:seed');
    return;
  }

  // One password hash is enough, because every demo account uses the same password.
  const passwordHash = await hashPassword(password);

  // Everything is saved together, or nothing is saved.
  await knex.transaction(async (trx) => {
    const organizationIds = new Map<string, number>();
    for (const name of ORGANIZATIONS) {
      const [row] = await trx('organizations').insert({ name }).returning('id');
      organizationIds.set(name, Number(row.id));
    }

    for (const user of USERS) {
      await trx('users').insert({
        organization_id: user.organization ? organizationIds.get(user.organization) : null,
        name: user.name,
        email: user.email,
        password_hash: passwordHash,
        role: user.role,
        is_active: true,
      });
    }
  });

  console.log(`Seeded ${ORGANIZATIONS.length} organizations and ${USERS.length} users (1 admin, 2 managers, 4 developers).`);
  console.log('All demo accounts use the password from SEED_PASSWORD in your .env file.');
  console.log('Demo accounts:');
  for (const user of USERS) {
    console.log(`  ${user.role.padEnd(13)} ${user.email}`);
  }
}