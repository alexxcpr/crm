import {
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'fs/promises';
import { tmpdir } from 'os';
import { basename, extname, join } from 'path';
import { pathToFileURL } from 'url';
import { isPdfBuffer } from './pdf-document.adapter';

interface ConversionPermit {
  release(): void;
}

interface PendingPermit {
  resolve: (permit: ConversionPermit) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export interface OfficeConversionResult {
  buffer: Buffer;
  fileName: string;
}

@Injectable()
export class OfficeConversionService {
  private readonly logger = new Logger(
    OfficeConversionService.name,
  );
  private activeConversions = 0;
  private readonly pending: PendingPermit[] = [];

  constructor(
    private readonly config: ConfigService,
  ) {}

  async convertDocxToPdf(
    document: Buffer,
    sourceFileName: string,
    requestedFileName?: string,
  ): Promise<OfficeConversionResult> {
    const startedAt = Date.now();
    const permit = await this.acquirePermit();
    const elapsedInQueue = Date.now() - startedAt;
    const remainingTimeout =
      this.timeoutMs - elapsedInQueue;

    try {
      if (remainingTimeout <= 0) {
        throw new GatewayTimeoutException(
          'Conversia Word in PDF a depasit timpul maxim permis.',
        );
      }
      const result =
        await this.convertInWorkspace(
          document,
          sourceFileName,
          requestedFileName,
          remainingTimeout,
        );
      this.logger.log(
        `Conversie Word-PDF finalizata in ${Date.now() - startedAt} ms (${result.buffer.length} bytes).`,
      );
      return result;
    } catch (error) {
      this.logger.warn(
        `Conversia Word-PDF a esuat dupa ${Date.now() - startedAt} ms: ${this.errorCategory(error)}`,
      );
      throw error;
    } finally {
      permit.release();
    }
  }

  normalizePdfFileName(
    requestedFileName: string | undefined,
    sourceFileName: string,
  ): string {
    const requested = requestedFileName?.trim();
    const sourceBase =
      basename(
        sourceFileName || 'document.docx',
      ) || 'document.docx';
    const raw = basename(requested || sourceBase)
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim();
    const extension = extname(raw);
    const stem = (
      extension
        ? raw.slice(0, -extension.length)
        : raw
    )
      .trim()
      .slice(0, 240);
    return `${stem || 'document'}.pdf`;
  }

  private async convertInWorkspace(
    document: Buffer,
    sourceFileName: string,
    requestedFileName: string | undefined,
    timeout: number,
  ): Promise<OfficeConversionResult> {
    const workspace = await mkdtemp(
      join(tmpdir(), 'moduvis-office-'),
    );
    const inputPath = join(
      workspace,
      'source.docx',
    );
    const outputDirectory = join(
      workspace,
      'output',
    );
    const profileDirectory = join(
      workspace,
      'profile',
    );

    try {
      await Promise.all([
        mkdir(outputDirectory),
        mkdir(profileDirectory),
        writeFile(inputPath, document),
      ]);
      const profileUrl = pathToFileURL(
        profileDirectory,
      ).href;
      await this.executeProcess(
        this.binary,
        [
          '--headless',
          '--safe-mode',
          '--nologo',
          '--nodefault',
          '--norestore',
          `-env:UserInstallation=${profileUrl}`,
          '--convert-to',
          'pdf:writer_pdf_Export',
          '--outdir',
          outputDirectory,
          inputPath,
        ],
        workspace,
        timeout,
      );
      const output = await readFile(
        join(outputDirectory, 'source.pdf'),
      ).catch(() => null);
      if (!output || !isPdfBuffer(output)) {
        throw new BadRequestException(
          'LibreOffice nu a produs un document PDF valid.',
        );
      }
      return {
        buffer: output,
        fileName: this.normalizePdfFileName(
          requestedFileName,
          sourceFileName,
        ),
      };
    } finally {
      await rm(workspace, {
        recursive: true,
        force: true,
      }).catch(() => undefined);
    }
  }

  private executeProcess(
    binary: string,
    args: string[],
    cwd: string,
    timeout: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile(
        binary,
        args,
        {
          cwd,
          timeout,
          maxBuffer: 1_000_000,
          windowsHide: true,
        },
        (error) => {
          if (!error) {
            resolve();
            return;
          }
          const processError =
            error as NodeJS.ErrnoException & {
              killed?: boolean;
            };
          if (processError.code === 'ENOENT') {
            reject(
              new ServiceUnavailableException(
                'Serviciul LibreOffice nu este disponibil.',
              ),
            );
            return;
          }
          if (
            processError.killed ||
            processError.code === 'ETIMEDOUT'
          ) {
            reject(
              new GatewayTimeoutException(
                'Conversia Word in PDF a depasit timpul maxim permis.',
              ),
            );
            return;
          }
          reject(
            new BadRequestException(
              'Documentul Word nu a putut fi convertit in PDF.',
            ),
          );
        },
      );
    });
  }

  private acquirePermit(): Promise<ConversionPermit> {
    if (
      this.activeConversions < this.maxConcurrency
    ) {
      this.activeConversions += 1;
      return Promise.resolve(this.permit());
    }
    if (this.pending.length >= this.maxQueue) {
      this.logger.warn(
        'Coada conversiilor Word-PDF este saturata.',
      );
      throw new ServiceUnavailableException(
        'Serviciul de conversie este ocupat. Reincearca mai tarziu.',
      );
    }

    return new Promise((resolve, reject) => {
      const entry: PendingPermit = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const index =
            this.pending.indexOf(entry);
          if (index >= 0)
            this.pending.splice(index, 1);
          reject(
            new GatewayTimeoutException(
              'Conversia Word in PDF a depasit timpul maxim permis.',
            ),
          );
        }, this.timeoutMs),
      };
      this.pending.push(entry);
    });
  }

  private permit(): ConversionPermit {
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        const next = this.pending.shift();
        if (next) {
          clearTimeout(next.timer);
          next.resolve(this.permit());
          return;
        }
        this.activeConversions = Math.max(
          0,
          this.activeConversions - 1,
        );
      },
    };
  }

  private numberConfig(
    key: string,
    fallback: number,
    minimum: number,
  ): number {
    const configured = Number(
      this.config.get<string>(
        key,
        String(fallback),
      ),
    );
    return Number.isFinite(configured) &&
      configured >= minimum
      ? Math.floor(configured)
      : fallback;
  }

  private errorCategory(error: unknown): string {
    if (error instanceof GatewayTimeoutException)
      return 'timeout';
    if (
      error instanceof ServiceUnavailableException
    )
      return 'unavailable';
    return 'conversion_error';
  }

  private get binary(): string {
    return this.config.get<string>(
      'LIBREOFFICE_BIN',
      '/usr/bin/soffice',
    );
  }

  private get timeoutMs(): number {
    return this.numberConfig(
      'WORKFLOW_OFFICE_CONVERSION_TIMEOUT_MS',
      60_000,
      1_000,
    );
  }

  private get maxConcurrency(): number {
    return this.numberConfig(
      'WORKFLOW_OFFICE_CONVERSION_MAX_CONCURRENCY',
      2,
      1,
    );
  }

  private get maxQueue(): number {
    return this.numberConfig(
      'WORKFLOW_OFFICE_CONVERSION_MAX_QUEUE',
      20,
      0,
    );
  }
}
