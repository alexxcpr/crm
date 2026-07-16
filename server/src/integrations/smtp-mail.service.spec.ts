import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { SmtpMailService } from './smtp-mail.service';

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

describe('SmtpMailService', () => {
  const sendMail = jest.fn();
  const close = jest.fn();
  const integrations = {
    findSmtpForSending: jest.fn().mockResolvedValue({
      row: { name: 'SMTP Vanzari' },
      config: {
        host: 'smtp.example.com',
        port: 587,
        security: 'starttls',
        username: 'mailer',
        fromName: 'Moduvis',
        fromEmail: 'noreply@example.com',
        rejectUnauthorized: true,
      },
      password: 'secret',
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail, close });
    sendMail.mockResolvedValue({ messageId: 'message-1' });
  });

  it('trimite text simplu cu setarile SMTP configurate', async () => {
    const service = new SmtpMailService(integrations as any);
    const result = await service.sendWorkflowEmail('integration-id', 'client@example.com', 'Subiect', 'Continut');

    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'mailer', pass: 'secret' },
    }));
    expect(sendMail).toHaveBeenCalledWith({
      from: { name: 'Moduvis', address: 'noreply@example.com' },
      to: 'client@example.com',
      subject: 'Subiect',
      text: 'Continut',
    });
    expect(result).toEqual({ data: { sent: true, messageId: 'message-1' } });
  });

  it('respinge destinatari multipli sau valori goale', async () => {
    const service = new SmtpMailService(integrations as any);
    await expect(service.sendWorkflowEmail('id', 'a@example.com,b@example.com', 'Subiect', 'Continut'))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.sendWorkflowEmail('id', 'a@example.com', '', 'Continut'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('propaga o eroare SMTP fara retry', async () => {
    sendMail.mockRejectedValueOnce(new Error('temporar'));
    const service = new SmtpMailService(integrations as any);
    await expect(service.sendWorkflowEmail('id', 'a@example.com', 'Subiect', 'Continut'))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalled();
  });
});
