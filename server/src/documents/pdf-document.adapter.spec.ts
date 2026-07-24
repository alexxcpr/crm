import { BadRequestException } from '@nestjs/common';
import {
  isPdfBuffer,
  PdfDocumentAdapter,
} from './pdf-document.adapter';

describe('PdfDocumentAdapter', () => {
  const adapter = new PdfDocumentAdapter();

  it('accepts a PDF signature and trailer', () => {
    const pdf = Buffer.from(
      '%PDF-1.7\nbody\n%%EOF\n',
    );
    expect(isPdfBuffer(pdf)).toBe(true);
    expect(() =>
      adapter.validate(pdf),
    ).not.toThrow();
  });

  it('rejects empty and corrupt PDF buffers', () => {
    expect(isPdfBuffer(Buffer.alloc(0))).toBe(
      false,
    );
    expect(() =>
      adapter.validate(Buffer.from('not-a-pdf')),
    ).toThrow(BadRequestException);
    expect(() =>
      adapter.validate(Buffer.from('%PDF-1.4')),
    ).toThrow(BadRequestException);
  });

  it('rejects PDF editing operations that are not part of this phase', async () => {
    await expect(
      adapter.execute('writeText', {
        document: Buffer.from('%PDF-1.4\n%%EOF'),
        args: {},
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
