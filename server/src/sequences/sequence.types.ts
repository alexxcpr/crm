import type { SequenceReset, SequenceScope } from 'src/types/entities';

export interface SequenceManifest {
  key: string;
  scope: SequenceScope;
  reset: SequenceReset;
  format: string;
  prefix?: string;
  padding?: number;
  start_value?: number;
}

export interface NormalizedSequenceManifest {
  key: string;
  scope: SequenceScope;
  reset: SequenceReset;
  format: string;
  prefix: string;
  padding: number;
  start_value: number;
}

export interface SequenceDateParts {
  day: string;
  month: string;
  year: string;
}
