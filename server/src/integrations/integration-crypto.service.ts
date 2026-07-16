import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

interface EncryptedEnvelope {
  v: 1;
  iv: string;
  tag: string;
  data: string;
}

@Injectable()
export class IntegrationCryptoService {
  constructor(private readonly config: ConfigService) {}

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const envelope: EncryptedEnvelope = {
      v: 1,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: encrypted.toString('base64'),
    };
    return JSON.stringify(envelope);
  }

  decrypt(value: string): string {
    try {
      const envelope = JSON.parse(value) as EncryptedEnvelope;
      if (envelope.v !== 1) throw new Error('Unsupported encrypted secret version');
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key(),
        Buffer.from(envelope.iv, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(envelope.data, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Parola integrarii nu a putut fi decriptata. Verifica cheia de criptare.');
    }
  }

  private key(): Buffer {
    const secret = this.config.get<string>('INTEGRATIONS_ENCRYPTION_KEY', '');
    if (secret.length < 32) {
      throw new ServiceUnavailableException(
        'INTEGRATIONS_ENCRYPTION_KEY trebuie configurata cu minimum 32 de caractere.',
      );
    }
    return createHash('sha256').update(secret, 'utf8').digest();
  }
}
