import {
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { isEmail } from 'class-validator';
import nodemailer from 'nodemailer';
import { IntegrationsService } from './integrations.service';

@Injectable()
export class SmtpMailService {
  constructor(
    private readonly integrations: IntegrationsService,
  ) {}

  async sendTest(
    integrationId: string,
    to: string,
  ) {
    return this.send(
      integrationId,
      to,
      'Test integrare SMTP Moduvis',
      'Acesta este un email de test trimis din Moduvis.',
    );
  }

  async sendWorkflowEmail(
    integrationId: string,
    to: string,
    subject: string,
    content: string,
    options?: {
      signal?: AbortSignal;
      deadlineAt?: number;
    },
  ) {
    return this.send(
      integrationId,
      to,
      subject,
      content,
      options,
    );
  }

  private async send(
    integrationId: string,
    toValue: string,
    subjectValue: string,
    contentValue: string,
    options?: {
      signal?: AbortSignal;
      deadlineAt?: number;
    },
  ) {
    const to = String(toValue ?? '').trim();
    const subject = String(
      subjectValue ?? '',
    ).trim();
    const content = String(
      contentValue ?? '',
    ).trim();
    if (
      !to ||
      to.includes(',') ||
      to.includes(';') ||
      !isEmail(to)
    ) {
      throw new BadRequestException(
        'Campul Catre trebuie sa contina o singura adresa de email valida.',
      );
    }
    if (!subject)
      throw new BadRequestException(
        'Subiectul emailului este gol.',
      );
    if (!content)
      throw new BadRequestException(
        'Continutul emailului este gol.',
      );

    this.assertWithinDeadline(options);
    const { row, config, password } =
      await this.integrations.findSmtpForSending(
        integrationId,
      );
    this.assertWithinDeadline(options);
    const remaining = Math.max(
      1,
      Math.min(
        60_000,
        (options?.deadlineAt ??
          Date.now() + 60_000) - Date.now(),
      ),
    );
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.security === 'tls',
      requireTLS: config.security === 'starttls',
      ignoreTLS: config.security === 'none',
      auth:
        config.username && password
          ? {
              user: config.username,
              pass: password,
            }
          : undefined,
      tls: {
        rejectUnauthorized:
          config.rejectUnauthorized,
      },
      connectionTimeout: remaining,
      greetingTimeout: remaining,
      socketTimeout: remaining,
    });

    try {
      const send = transport.sendMail({
        from: {
          name: config.fromName ?? row.name,
          address: config.fromEmail,
        },
        to,
        subject,
        text: content,
      });
      const info = await this.withAbort(
        send,
        options?.signal,
      );
      return {
        data: {
          sent: true,
          messageId: String(info.messageId ?? ''),
        },
      };
    } catch (error) {
      if (
        options?.signal?.aborted ||
        error instanceof GatewayTimeoutException
      ) {
        throw new GatewayTimeoutException(
          'Trimiterea emailului a depasit timpul ramas al workflow-ului.',
        );
      }
      throw new ServiceUnavailableException(
        `Emailul nu a putut fi trimis prin integrarea "${row.name}".`,
      );
    } finally {
      transport.close();
    }
  }

  private assertWithinDeadline(options?: {
    signal?: AbortSignal;
    deadlineAt?: number;
  }) {
    if (
      options?.signal?.aborted ||
      (options?.deadlineAt !== undefined &&
        Date.now() >= options.deadlineAt)
    ) {
      throw new GatewayTimeoutException(
        'Trimiterea emailului a depasit timpul ramas al workflow-ului.',
      );
    }
  }

  private async withAbort<T>(
    promise: Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (!signal) return promise;
    if (signal.aborted) {
      throw new GatewayTimeoutException(
        'Trimiterea emailului a depasit timpul ramas al workflow-ului.',
      );
    }
    return new Promise<T>((resolve, reject) => {
      const abort = () =>
        reject(
          new GatewayTimeoutException(
            'Trimiterea emailului a depasit timpul ramas al workflow-ului.',
          ),
        );
      signal.addEventListener('abort', abort, {
        once: true,
      });
      promise
        .then(resolve, reject)
        .finally(() => {
          signal.removeEventListener(
            'abort',
            abort,
          );
        });
    });
  }
}
