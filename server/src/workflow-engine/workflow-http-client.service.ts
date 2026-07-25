import {
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
} from '@nestjs/common';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { WorkflowHttpDomainService } from './http-domain.service';

const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;
const HTTP_TIMEOUT_MS = 15_000;

@Injectable()
export class WorkflowHttpClientService {
  constructor(
    private readonly domains: WorkflowHttpDomainService,
  ) {}

  async request(input: {
    method: string;
    url: string;
    body?: unknown;
    deadlineAt: number;
    signal?: AbortSignal;
  }): Promise<any> {
    const method = String(
      input.method || 'GET',
    ).toUpperCase();
    if (
      !['GET', 'POST', 'PUT', 'DELETE'].includes(
        method,
      )
    ) {
      throw new BadRequestException(
        `Metoda HTTP "${method}" nu este permisa.`,
      );
    }
    let currentUrl = this.parseUrl(input.url);
    let redirects = 0;

    while (true) {
      await this.validateDestination(currentUrl);
      const remaining =
        input.deadlineAt - Date.now();
      if (remaining <= 0) {
        throw new GatewayTimeoutException(
          'Workflow-ul a depasit limita de 60 de secunde.',
        );
      }
      const controller = new AbortController();
      const abortFromWorkflow = () =>
        controller.abort();
      input.signal?.addEventListener(
        'abort',
        abortFromWorkflow,
        {
          once: true,
        },
      );
      if (input.signal?.aborted)
        controller.abort();
      const timeout = setTimeout(
        () => controller.abort(),
        Math.max(
          1,
          Math.min(HTTP_TIMEOUT_MS, remaining),
        ),
      );
      try {
        const body =
          method === 'GET' ||
          input.body === undefined ||
          input.body === ''
            ? undefined
            : typeof input.body === 'string'
              ? input.body
              : JSON.stringify(input.body);
        const response = await fetch(currentUrl, {
          method,
          body,
          redirect: 'manual',
          signal: controller.signal,
          headers: body
            ? {
                'content-type':
                  'application/json',
              }
            : undefined,
        });

        if (
          [301, 302, 303, 307, 308].includes(
            response.status,
          )
        ) {
          const location =
            response.headers.get('location');
          if (!location) {
            throw new BadRequestException(
              'Redirectul HTTP nu contine headerul Location.',
            );
          }
          if (redirects >= MAX_REDIRECTS) {
            throw new BadRequestException(
              'Cererea HTTP a depasit limita de 3 redirecturi.',
            );
          }
          currentUrl = new URL(
            location,
            currentUrl,
          );
          redirects += 1;
          continue;
        }

        const contentLength = Number(
          response.headers.get(
            'content-length',
          ) ?? 0,
        );
        if (contentLength > MAX_RESPONSE_BYTES) {
          throw new BadRequestException(
            'Raspunsul HTTP depaseste limita de 1 MB.',
          );
        }
        const text =
          await this.readLimited(response);
        if (!response.ok) {
          throw new BadRequestException(
            `HTTP ${response.status}: ${text.slice(0, 2000)}`,
          );
        }
        const contentType =
          response.headers.get('content-type') ??
          '';
        if (
          contentType.includes(
            'application/json',
          ) &&
          text
        ) {
          try {
            return JSON.parse(text);
          } catch {
            throw new BadRequestException(
              'Serviciul HTTP a returnat JSON invalid.',
            );
          }
        }
        return {
          status: response.status,
          body: text,
        };
      } catch (error) {
        if (
          (error as Error)?.name === 'AbortError'
        ) {
          throw new GatewayTimeoutException(
            'Cererea HTTP din workflow a expirat.',
          );
        }
        throw error;
      } finally {
        clearTimeout(timeout);
        input.signal?.removeEventListener(
          'abort',
          abortFromWorkflow,
        );
      }
    }
  }

  private parseUrl(value: string): URL {
    let url: URL;
    try {
      url = new URL(String(value ?? '').trim());
    } catch {
      throw new BadRequestException(
        'URL-ul nodului HTTP nu este valid.',
      );
    }
    if (
      !['http:', 'https:'].includes(url.protocol)
    ) {
      throw new BadRequestException(
        'Sunt permise numai URL-uri HTTP/HTTPS.',
      );
    }
    if (url.username || url.password) {
      throw new BadRequestException(
        'Credentialele nu sunt permise direct in URL.',
      );
    }
    return url;
  }

  private async validateDestination(url: URL) {
    await this.domains.assertAllowed(url);
    const addresses = await lookup(url.hostname, {
      all: true,
      verbatim: true,
    });
    if (
      !addresses.length ||
      addresses.some(({ address }) =>
        this.isPrivate(address),
      )
    ) {
      throw new BadRequestException(
        'Domeniul HTTP se rezolva catre o adresa privata sau rezervata.',
      );
    }
  }

  private isPrivate(address: string): boolean {
    const version = isIP(address);
    if (version === 4) {
      const parts = address
        .split('.')
        .map(Number);
      const [a, b] = parts;
      return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 192 && b === 0) ||
        (a === 192 &&
          b === 0 &&
          parts[2] === 2) ||
        (a === 198 && (b === 18 || b === 19)) ||
        (a === 198 &&
          b === 51 &&
          parts[2] === 100) ||
        (a === 203 &&
          b === 0 &&
          parts[2] === 113) ||
        a >= 224
      );
    }
    if (version === 6) {
      const normalized = address.toLowerCase();
      if (normalized.startsWith('::ffff:')) {
        return this.isPrivate(
          normalized.slice(7),
        );
      }
      return (
        normalized === '::' ||
        normalized === '::1' ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd') ||
        /^fe[89ab]/.test(normalized) ||
        normalized.startsWith('ff') ||
        normalized.startsWith('2001:db8')
      );
    }
    return true;
  }

  private async readLimited(
    response: Response,
  ): Promise<string> {
    if (!response.body) return '';
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new BadRequestException(
          'Raspunsul HTTP depaseste limita de 1 MB.',
        );
      }
      chunks.push(value);
    }
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(joined);
  }
}
