import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly encryptionKey: Buffer;

  constructor(private configService: ConfigService) {
    const key = this.configService.get<string>('ENCRYPTION_KEY');
    if (!key) {
      throw new Error('ENCRYPTION_KEY is not set in environment variables');
    }
    this.encryptionKey = crypto.createHash('sha256').update(key).digest();
  }

  /**
   * Encrypt sensitive credential data
   */
  encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt credential data
   */
  decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      iv,
    );
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  // /**
  //  * Encrypt sensitive credential data
  //  */
  // private encrypt(text: string): string {
  //   const iv = crypto.randomBytes(16);
  //   const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

  //   let encrypted = cipher.update(text, 'utf8', 'hex');
  //   encrypted += cipher.final('hex');

  //   const authTag = cipher.getAuthTag();

  //   return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  // }

  // /**
  //  * Decrypt credential data
  //  */
  // private decrypt(encryptedText: string): string {
  //   const parts = encryptedText.split(':');
  //   const iv = Buffer.from(parts[0], 'hex');
  //   const authTag = Buffer.from(parts[1], 'hex');
  //   const encrypted = parts[2];

  //   const decipher = crypto.createDecipheriv(
  //     'aes-256-gcm',
  //     this.encryptionKey,
  //     iv,
  //   );
  //   decipher.setAuthTag(authTag);

  //   let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  //   decrypted += decipher.final('utf8');

  //   return decrypted;
  // }
}
