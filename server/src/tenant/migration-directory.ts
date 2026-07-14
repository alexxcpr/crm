import { existsSync } from 'fs';
import { join } from 'path';

export type MigrationExtension = 'js' | 'ts';

export function migrationDirectory(kind: 'meta' | 'tenant', preferredExtension?: MigrationExtension) {
  const source = join(process.cwd(), 'migrations', kind);
  const compiled = join(process.cwd(), 'dist/migrations', kind);

  if (preferredExtension === 'ts' && existsSync(source)) {
    return { directory: source, extension: 'ts', loadExtensions: ['.ts'] };
  }
  if (preferredExtension === 'js' && existsSync(compiled)) {
    return { directory: compiled, extension: 'js', loadExtensions: ['.js'] };
  }
  if (__filename.endsWith('.ts') && existsSync(source)) {
    return { directory: source, extension: 'ts', loadExtensions: ['.ts'] };
  }
  if (existsSync(compiled)) {
    return { directory: compiled, extension: 'js', loadExtensions: ['.js'] };
  }

  return { directory: source, extension: 'ts', loadExtensions: ['.ts'] };
}
