// src/services/upload.service.ts
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly uploadDir = process.env.UPLOAD_DIR || '/var/www/uploads';
  private readonly publicBaseUrl =
    process.env.PUBLIC_BASE_URL || 'https://cdn.seninsite.com/uploads';

  constructor() {
    // Upload dizini yoksa oluştur
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
      this.logger.log(`Upload directory created at ${this.uploadDir}`);
    }
  }
  getFileUrl(filename: string): string {
    // Returns a public URL (assuming static files served at /uploads)
    return `/uploads/${filename}`;
  }
  /**
   * Dosyayı kaydeder ve public URL döner
   */
  async saveFile(fileBuffer: Buffer, originalName: string): Promise<string> {
    const fileName = `${uuidv4()}${path.extname(originalName)}`;
    const filePath = path.join(this.uploadDir, fileName);

    await fs.promises.writeFile(filePath, fileBuffer);
    this.logger.log(`File saved: ${filePath}`);

    return `${this.publicBaseUrl}/${fileName}`;
  }
  async handleFileUpload(file: Express.Multer.File | Express.Multer.File[]) {
    const _files = Array.isArray(file) ? file : [file];
    const paths: string[] = [];
    const originalName: string[] = [];
    const size: string[] = [];

    for (const f of _files) {
      this.logger.log(
        `Uploading file: ${f.originalname}, Size: ${f.size}, Type: ${f.mimetype}`,
      );

      // When using diskStorage, the file is already saved to disk
      // f.filename is the saved filename, f.path is the full path
      // We just need to return the public URL
      const publicUrl = `${this.publicBaseUrl}/${f.filename}`;
      paths.push(publicUrl);
      originalName.push(f.originalname);
      size.push(f.size.toString());
    }

    return {
      message: 'File uploaded successfully',
      filePaths: paths.toString(),
      sizes: size.toString(),
      filenames: originalName.toString(),
    };
  }

  async deleteFileByUrl(fileUrls: string | string[]): Promise<void> {
    const urlsToDelete = Array.isArray(fileUrls) ? fileUrls : [fileUrls];

    for (const url of urlsToDelete) {
      // 1. Dosya adını URL'den çıkar
      // publicBaseUrl'den sonraki kısmı al
      const urlParts = url.split(this.publicBaseUrl);
      if (urlParts.length !== 2) {
        this.logger.error(
          `Invalid file URL format: ${url}. Skipping deletion.`,
        );
        continue;
      }

      // Baştaki '/' karakterini kaldır (örneğin: "/filename.jpg" -> "filename.jpg")
      const fileName = urlParts[1].startsWith('/')
        ? urlParts[1].substring(1)
        : urlParts[1];

      // Güvenlik kontrolü: Dosya adında yol geçişi (path traversal) olmamasını sağla
      if (!fileName || fileName.includes('..') || path.isAbsolute(fileName)) {
        this.logger.warn(
          `Suspicious or empty filename extracted from URL: ${url}. Skipping.`,
        );
        continue;
      }

      // 2. Yerel dosya yolunu oluştur
      const filePath = path.join(this.uploadDir, fileName);

      // 3. Dosyayı sil
      try {
        await fs.promises.unlink(filePath);
        this.logger.log(`File deleted successfully: ${filePath}`);
      } catch (error) {
        // ENOENT (Error NO ENTry) hatası, dosyanın zaten mevcut olmadığı anlamına gelir.
        if (error.code === 'ENOENT') {
          this.logger.warn(
            `File not found on disk, skipping deletion: ${filePath}`,
          );
        } else {
          // Diğer tüm hataları logla
          this.logger.error(`Error deleting file ${filePath}:`, error.message);
        }
      }
    }
  }
}
