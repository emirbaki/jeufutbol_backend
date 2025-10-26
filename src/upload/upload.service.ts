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
      const uploadResult = await this.saveFile(f.buffer, f.originalname);
      paths.push(uploadResult);
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
}
