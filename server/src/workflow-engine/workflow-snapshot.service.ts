import { Injectable } from '@nestjs/common';

const MAX_SNAPSHOT_BYTES = 256 * 1024;
const SENSITIVE_KEY =
  /password|secret|token|authorization|cookie|api[_-]?key|credential|hash/i;

@Injectable()
export class WorkflowSnapshotService {
  sanitize(value: unknown): unknown {
    const seen = new WeakSet<object>();
    const sanitized = this.walk(value, seen, 0);
    const serialized = this.stringify(sanitized);
    const sizeBytes = Buffer.byteLength(
      serialized,
      'utf8',
    );
    if (sizeBytes <= MAX_SNAPSHOT_BYTES)
      return sanitized;
    return {
      truncated: true,
      sizeBytes,
      preview: serialized.slice(0, 16_000),
    };
  }

  private walk(
    value: unknown,
    seen: WeakSet<object>,
    depth: number,
  ): unknown {
    if (value === null || value === undefined)
      return value;
    if (depth > 12) return '[MAX_DEPTH]';
    if (typeof value === 'bigint')
      return value.toString();
    if (value instanceof Date)
      return value.toISOString();
    if (Buffer.isBuffer(value)) {
      return {
        type: 'Buffer',
        sizeBytes: value.byteLength,
      };
    }
    if (typeof value !== 'object') return value;
    if (seen.has(value as object))
      return '[CIRCULAR]';
    seen.add(value as object);

    if (Array.isArray(value)) {
      return value
        .slice(0, 1000)
        .map((item) =>
          this.walk(item, seen, depth + 1),
        );
    }

    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      output[key] = SENSITIVE_KEY.test(key)
        ? '[REDACTED]'
        : this.walk(child, seen, depth + 1);
    }
    return output;
  }

  private stringify(value: unknown): string {
    try {
      return JSON.stringify(value);
    } catch {
      return JSON.stringify({
        serializationError: true,
      });
    }
  }
}
