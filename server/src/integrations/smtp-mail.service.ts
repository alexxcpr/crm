import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { isEmail } from 'class-validator';
import nodemailer from 'nodemailer';
import { IntegrationsService } from './integrations.service';

@Injectable()
export class SmtpMailService {
  constructor(private readonly integrations: IntegrationsService) {}

  async sendTest(integrationId: string, to: string) {
    return this.send(integrationId, to, 'Test integrare SMTP Moduvis', 'Acesta este un email de test trimis din Moduvis.');
  }

  async sendWorkflowEmail(integrationId: string, to: string, subject: string, content: string) {
    return this.send(integrationId, to, subject, content);
  }

  private async send(integrationId: string, toValue: string, subjectValue: string, contentValue: string) {
    const to = String(toValue ?? '').trim();
    const subject = String(subjectValue ?? '').trim();
    const content = String(contentValue ?? '').trim();
    if (!to || to.includes(',') || to.includes(';') || !isEmail(to)) {
      throw new BadRequestException('Campul Catre trebuie sa contina o singura adresa de email valida.');
    }
    if (!subject) throw new BadRequestException('Subiectul emailului este gol.');
    if (!content) throw new BadRequestException('Continutul emailului este gol.');

    const { row, config, password } = await this.integrations.findSmtpForSending(integrationId);
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.security === 'tls',
      requireTLS: config.security === 'starttls',
      ignoreTLS: config.security === 'none',
      auth: config.username && password ? { user: config.username, pass: password } : undefined,
      tls: { rejectUnauthorized: config.rejectUnauthorized },
    });

    try {
      const info = await transport.sendMail({
        from: { name: config.fromName ?? row.name, address: config.fromEmail },
        to,
        subject,
        text: content,
      });
      return { data: { sent: true, messageId: String(info.messageId ?? '') } };
    } catch {
      throw new ServiceUnavailableException(`Emailul nu a putut fi trimis prin integrarea "${row.name}".`);
    } finally {
      transport.close();
    }
  }
}
