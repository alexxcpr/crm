import { existsSync } from 'fs';
import { join } from 'path';

export function migrationDirectory(kind: 'meta' | 'tenant') {
  const compiled = join(process.cwd(), 'dist/migrations', kind);
  if (existsSync(compiled)) {
    return { directory: compiled, extension: 'js', loadExtensions: ['.js'] };
  }

  return { directory: join(process.cwd(), 'migrations', kind), extension: 'ts', loadExtensions: ['.ts'] };
}
