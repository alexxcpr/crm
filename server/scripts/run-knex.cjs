const { existsSync } = require('node:fs');
const { spawnSync } = require('node:child_process');

const isProduction = process.env.NODE_ENV === 'production';
const knexfile = isProduction ? 'dist/knexfile.js' : 'knexfile.ts';

if (!existsSync(knexfile)) {
  process.stderr.write(
    `Configuratia Knex nu exista: ${knexfile}. Ruleaza npm run build inainte de migrarile de productie.\n`,
  );
  process.exit(1);
}

const knexCli = require.resolve('knex/bin/cli.js');
const result = spawnSync(
  process.execPath,
  [knexCli, ...process.argv.slice(2), '--knexfile', knexfile],
  { stdio: 'inherit' },
);

if (result.error) {
  process.stderr.write(`${result.error.message}\n`);
  process.exit(1);
}

process.exit(result.status ?? 1);
