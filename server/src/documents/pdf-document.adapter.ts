import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import type {
  DocumentAdapterInput,
  DocumentAdapterResult,
  DocumentPackageAdapter,
} from './document.types';

export const PDF_MIME = 'application/pdf';

export function isPdfBuffer(
  buffer: Buffer,
): boolean {
  if (!buffer.length) return false;
  const header = buffer
    .subarray(0, Math.min(buffer.length, 1_024))
    .toString('latin1');
  const trailer = buffer
    .subarray(Math.max(0, buffer.length - 2_048))
    .toString('latin1');
  return (
    header.includes('%PDF-') &&
    trailer.includes('%%EOF')
  );
}

@Injectable()
export class PdfDocumentAdapter implements DocumentPackageAdapter {
  readonly package = 'pdf' as const;
  readonly mimeTypes = [PDF_MIME] as const;

  validate(buffer: Buffer): void {
    if (!isPdfBuffer(buffer)) {
      throw new BadRequestException(
        'Fisierul nu este un document PDF valid.',
      );
    }
  }

  async execute(
    operation: string,
    _input: DocumentAdapterInput,
  ): Promise<DocumentAdapterResult> {
    throw new BadRequestException(
      `Operatia PDF "${operation}" nu este suportata.`,
    );
  }
}
