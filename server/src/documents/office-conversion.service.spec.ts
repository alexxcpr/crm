import {
  GatewayTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { access, writeFile } from 'fs/promises';
import { join } from 'path';
import { OfficeConversionService } from './office-conversion.service';

function makeService(
  values: Record<string, string> = {},
) {
  return new OfficeConversionService({
    get: jest.fn(
      (key: string, fallback: string) =>
        values[key] ?? fallback,
    ),
  } as any);
}

describe('OfficeConversionService', () => {
  it('runs LibreOffice with isolated paths, validates output and removes the workspace', async () => {
    const service = makeService();
    let workspace = '';
    const execute = jest
      .spyOn(service as any, 'executeProcess')
      .mockImplementation(
        async (
          _binary: string,
          args: string[],
          cwd: string,
        ) => {
          workspace = cwd;
          const outputIndex =
            args.indexOf('--outdir') + 1;
          await writeFile(
            join(args[outputIndex], 'source.pdf'),
            Buffer.from(
              '%PDF-1.7\nconverted\n%%EOF',
            ),
          );
        },
      );

    const result = await service.convertDocxToPdf(
      Buffer.from('docx'),
      'template.docx',
      'contract-final.docx',
    );

    expect(result.fileName).toBe(
      'contract-final.pdf',
    );
    expect(result.buffer.toString()).toContain(
      '%PDF-1.7',
    );
    expect(execute).toHaveBeenCalledWith(
      '/usr/bin/soffice',
      expect.arrayContaining([
        '--headless',
        '--safe-mode',
        '--convert-to',
        'pdf:writer_pdf_Export',
      ]),
      expect.stringContaining('moduvis-office-'),
      expect.any(Number),
    );
    await expect(
      access(workspace),
    ).rejects.toThrow();
  });

  it('normalizes the PDF name from the requested or source file name', () => {
    const service = makeService();
    expect(
      service.normalizePdfFileName(
        undefined,
        'template.docx',
      ),
    ).toBe('template.pdf');
    expect(
      service.normalizePdfFileName(
        '../contract final.DOCX',
        'template.docx',
      ),
    ).toBe('contract final.pdf');
  });

  it('propagates conversion timeouts and missing binary errors', async () => {
    const timeoutService = makeService();
    jest
      .spyOn(
        timeoutService as any,
        'executeProcess',
      )
      .mockRejectedValue(
        new GatewayTimeoutException(),
      );
    await expect(
      timeoutService.convertDocxToPdf(
        Buffer.from('docx'),
        'template.docx',
      ),
    ).rejects.toBeInstanceOf(
      GatewayTimeoutException,
    );

    const unavailableService = makeService();
    jest
      .spyOn(
        unavailableService as any,
        'executeProcess',
      )
      .mockRejectedValue(
        new ServiceUnavailableException(),
      );
    await expect(
      unavailableService.convertDocxToPdf(
        Buffer.from('docx'),
        'template.docx',
      ),
    ).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects requests when the conversion queue is saturated', async () => {
    const service = makeService({
      WORKFLOW_OFFICE_CONVERSION_MAX_CONCURRENCY:
        '1',
      WORKFLOW_OFFICE_CONVERSION_MAX_QUEUE: '0',
    });
    let finish!: () => void;
    jest
      .spyOn(service as any, 'convertInWorkspace')
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = () =>
              resolve({
                buffer: Buffer.from(
                  '%PDF-1.4\n%%EOF',
                ),
                fileName: 'first.pdf',
              });
          }),
      );

    const first = service.convertDocxToPdf(
      Buffer.from('first'),
      'first.docx',
    );
    await Promise.resolve();
    await expect(
      service.convertDocxToPdf(
        Buffer.from('second'),
        'second.docx',
      ),
    ).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    finish();
    await expect(first).resolves.toMatchObject({
      fileName: 'first.pdf',
    });
  });
});
