import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { TenantProvisioningService } from '../src/tenant';

function parseArgs(argv: string[]): Record<string, string | true> {
  return argv.reduce<Record<string, string | true>>((acc, arg) => {
    if (!arg.startsWith('--')) return acc;
    const [key, value] = arg.slice(2).split('=');
    acc[key] = value ?? true;
    return acc;
  }, {});
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = args.slug;
  if (typeof slug !== 'string') {
    throw new Error('Usage: npm run tenant:provision -- --slug=acme [--plan=starter] [--admin-email=admin@example.com] [--admin-password=...]');
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    const service = app.get(TenantProvisioningService);
    const result = await service.provision({
      slug,
      plan: typeof args.plan === 'string' ? args.plan : 'starter',
      maxUsers: typeof args['max-users'] === 'string' ? Number(args['max-users']) : undefined,
      adminEmail: typeof args['admin-email'] === 'string' ? args['admin-email'] : undefined,
      adminPassword: typeof args['admin-password'] === 'string' ? args['admin-password'] : undefined,
    });

    console.log(`Tenant ready: ${result.slug} -> ${result.dbName}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
