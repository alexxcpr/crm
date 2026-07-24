export type DocumentPackage =
  | 'word'
  | 'pdf'
  | 'excel'
  | 'image';

export interface DocumentHandle {
  sessionId: string;
  package: DocumentPackage;
  revision: number;
  mimeType: string;
  fileName: string;
  expiresAt: string;
}

export interface DocumentExecuteRequest {
  package: DocumentPackage;
  operation: string;
  executionId: string;
  idempotencyKey: string;
  document?: DocumentHandle;
  documents?: DocumentHandle[];
  args?: Record<string, unknown>;
}

export interface DocumentExecuteData {
  document: DocumentHandle;
  document_handle: DocumentHandle;
  document_revision: number;
  result?: Record<string, unknown>;
  file?: {
    id_file: string;
    version: number;
    file_name: string;
    mime_type: string;
    size_bytes: number;
  };
  id_file?: string;
  version?: number;
  file_name?: string;
  mime_type?: string;
  size_bytes?: number;
  [key: string]: unknown;
}

export type DocumentAdapterResult =
  | {
      kind: 'mutation';
      buffer: Buffer;
      result?: Record<string, unknown>;
    }
  | {
      kind: 'value';
      result: Record<string, unknown>;
    }
  | {
      kind: 'new-document';
      buffer: Buffer;
      package?: DocumentPackage;
      mimeType: string;
      fileName: string;
      result?: Record<string, unknown>;
    }
  | {
      kind: 'persistent-file';
      buffer: Buffer;
      mimeType: string;
      fileName: string;
      result?: Record<string, unknown>;
    };

export interface DocumentAdapterInput {
  document?: Buffer;
  documents?: Buffer[];
  args: Record<string, unknown>;
  source?: {
    package: DocumentPackage;
    mimeType: string;
    fileName: string;
  };
}

export interface DocumentPackageAdapter {
  readonly package: DocumentPackage;
  readonly mimeTypes: readonly string[];
  validate(buffer: Buffer): void;
  execute(
    operation: string,
    input: DocumentAdapterInput,
  ): Promise<DocumentAdapterResult>;
}
