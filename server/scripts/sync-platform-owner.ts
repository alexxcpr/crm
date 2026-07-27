import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MetaDbService } from '../src/tenant/meta-db.service';
import { TenantProvisioningService } from '../src/tenant/tenant-provisioning.service';

function isDryRun(): boolean {
  return process.argv
    .slice(2)
    .includes('--dry-run');
}

async function main() {
  const dryRun = isDryRun();
  const app =
    await NestFactory.createApplicationContext(
      AppModule,
      {
        logger: ['error', 'warn'],
      },
    );

  try {
    const meta = app.get(MetaDbService);
    const provisioning = app.get(
      TenantProvisioningService,
    );
    const tenants = await meta
      .knex('tenants')
      .where({ is_active: true })
      .select('slug', 'db_name')
      .orderBy('slug');

    let failed = 0;
    for (const tenant of tenants) {
      try {
        const result =
          await provisioning.syncPlatformOwnerAccount(
            tenant.db_name,
            { dryRun },
          );
        console.log(
          `${dryRun ? 'DRY-RUN' : 'OK'} ${tenant.slug}: ${result.status}`,
        );
        if (
          result.status !== 'missing_config' &&
          !result.ownerExists &&
          dryRun
        ) {
          console.warn(
            `WARN ${tenant.slug}: nu are Platform Owner; sincronizarea il va crea.`,
          );
        }
        if (
          result.status === 'missing_config' &&
          !result.ownerExists
        ) {
          console.warn(
            `WARN ${tenant.slug}: credentialele lipsesc; Platform Owner nu poate fi verificat sau sincronizat.`,
          );
        }
        if (result.activeTenantAdmins === 0) {
          console.warn(
            `WARN ${tenant.slug}: nu are niciun Tenant Admin activ.`,
          );
        }
      } catch (error) {
        failed += 1;
        console.error(
          `FAIL ${tenant.slug}:`,
          error instanceof Error
            ? error.message
            : error,
        );
      }
    }

    console.log(
      `${dryRun ? 'Checked' : 'Synchronized'} ${tenants.length - failed}/${tenants.length} tenants`,
    );
    if (failed) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
