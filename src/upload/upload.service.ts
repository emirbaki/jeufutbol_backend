// src/services/upload.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

interface ChunkUploadSession {
  filename: string;
  totalSize: number;
  totalChunks: number;
  mimeType: string;
  receivedChunks: number[];
  createdAt: Date;
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly uploadDir = process.env.UPLOAD_DIR || '/var/www/uploads';
  private readonly tempDir = path.join(this.uploadDir, 'temp');
  private readonly publicBaseUrl =
    process.env.PUBLIC_BASE_URL || 'https://cdn.seninsite.com/uploads';

  // In-memory session store (in production, consider Redis for multi-instance)
  private uploadSessions = new Map<string, ChunkUploadSession>();

  constructor() {
    // Create upload directories if they don't exist
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
      this.logger.log(`Upload directory created at ${this.uploadDir}`);
    }
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
      this.logger.log(`Temp directory created at ${this.tempDir}`);
    }
  }

  getFileUrl(filename: string): string {
    return `/uploads/${filename}`;
  }

  /**
   * Save a file from buffer and return public URL
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

      // When using diskStorage, file is already saved to disk
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
      const urlParts = url.split(this.publicBaseUrl);
      if (urlParts.length !== 2) {
        this.logger.error(`Invalid file URL format: ${url}. Skipping deletion.`);
        continue;
      }

      const fileName = urlParts[1].startsWith('/')
        ? urlParts[1].substring(1)
        : urlParts[1];

      if (!fileName || fileName.includes('..') || path.isAbsolute(fileName)) {
        this.logger.warn(`Suspicious filename from URL: ${url}. Skipping.`);
        continue;
      }

      const filePath = path.join(this.uploadDir, fileName);

      try {
        await fs.promises.unlink(filePath);
        this.logger.log(`File deleted successfully: ${filePath}`);
      } catch (error) {
        if (error.code === 'ENOENT') {
          this.logger.warn(`File not found, skipping deletion: ${filePath}`);
        } else {
          this.logger.error(`Error deleting file ${filePath}:`, error.message);
        }
      }
    }
  }

  // ============================================
  // CHUNKED UPLOAD METHODS
  // ============================================

  /**
   * Initialize a chunked upload session
   */
  async initChunkUpload(
    filename: string,
    totalSize: number,
    totalChunks: number,
    mimeType: string,
  ): Promise<string> {
    const uploadId = uuidv4();
    const sessionDir = path.join(this.tempDir, uploadId);

    // Create temp directory for this upload
    await fs.promises.mkdir(sessionDir, { recursive: true });

    // Store session info
    this.uploadSessions.set(uploadId, {
      filename,
      totalSize,
      totalChunks,
      mimeType,
      receivedChunks: [],
      createdAt: new Date(),
    });

    this.logger.log(
      `Chunked upload initialized: ${uploadId} for ${filename} (${totalChunks} chunks, ${(totalSize / 1024 / 1024).toFixed(2)}MB)`,
    );

    return uploadId;
  }

  /**
   * Save a single chunk
   */
  async saveChunk(
    uploadId: string,
    chunkIndex: number,
    chunkBuffer: Buffer,
  ): Promise<{ received: boolean; chunkIndex: number }> {
    const session = this.uploadSessions.get(uploadId);
    if (!session) {
      throw new BadRequestException(`Invalid upload session: ${uploadId}`);
    }

    const chunkPath = path.join(this.tempDir, uploadId, `chunk-${chunkIndex}`);
    await fs.promises.writeFile(chunkPath, chunkBuffer);

    // Track received chunk
    if (!session.receivedChunks.includes(chunkIndex)) {
      session.receivedChunks.push(chunkIndex);
    }

    this.logger.log(
      `Chunk ${chunkIndex + 1}/${session.totalChunks} received for upload ${uploadId}`,
    );

    return { received: true, chunkIndex };
  }

  /**
   * Complete chunked upload - assemble all chunks into final file
   */
  async completeChunkUpload(
    uploadId: string,
  ): Promise<{ publicUrl: string; filename: string; size: number }> {
    const session = this.uploadSessions.get(uploadId);
    if (!session) {
      throw new BadRequestException(`Invalid upload session: ${uploadId}`);
    }

    // Verify all chunks received
    if (session.receivedChunks.length !== session.totalChunks) {
      throw new BadRequestException(
        `Missing chunks: received ${session.receivedChunks.length}/${session.totalChunks}`,
      );
    }

    const sessionDir = path.join(this.tempDir, uploadId);
    const ext = path.extname(session.filename);
    const finalFilename = `${uuidv4()}${ext}`;
    const finalPath = path.join(this.uploadDir, finalFilename);

    // Create write stream for final file
    const writeStream = fs.createWriteStream(finalPath);

    try {
      // Concatenate chunks in order
      for (let i = 0; i < session.totalChunks; i++) {
        const chunkPath = path.join(sessionDir, `chunk-${i}`);
        const chunkData = await fs.promises.readFile(chunkPath);
        writeStream.write(chunkData);
      }

      // Close write stream
      await new Promise<void>((resolve, reject) => {
        writeStream.end((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Get final file size
      const stats = await fs.promises.stat(finalPath);

      this.logger.log(
        `Chunked upload completed: ${finalFilename} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`,
      );

      // Cleanup temp files
      await this.cleanupSession(uploadId);

      return {
        publicUrl: `${this.publicBaseUrl}/${finalFilename}`,
        filename: session.filename,
        size: stats.size,
      };
    } catch (error) {
      writeStream.destroy();
      this.logger.error(`Failed to complete chunked upload: ${error.message}`);
      throw new BadRequestException('Failed to assemble file chunks');
    }
  }

  /**
   * Cleanup a specific upload session
   */
  private async cleanupSession(uploadId: string): Promise<void> {
    const sessionDir = path.join(this.tempDir, uploadId);

    try {
      await fs.promises.rm(sessionDir, { recursive: true, force: true });
      this.uploadSessions.delete(uploadId);
      this.logger.log(`Cleaned up session: ${uploadId}`);
    } catch (error) {
      this.logger.error(`Failed to cleanup session ${uploadId}:`, error.message);
    }
  }

  /**
   * Cleanup incomplete uploads older than maxAgeHours
   */
  async cleanupIncompleteUploads(maxAgeHours = 24): Promise<void> {
    const now = new Date();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

    for (const [uploadId, session] of this.uploadSessions.entries()) {
      const age = now.getTime() - session.createdAt.getTime();
      if (age > maxAgeMs) {
        this.logger.log(`Cleaning up stale upload session: ${uploadId}`);
        await this.cleanupSession(uploadId);
      }
    }

    // Also cleanup orphaned temp directories
    try {
      const tempDirs = await fs.promises.readdir(this.tempDir);
      for (const dir of tempDirs) {
        if (!this.uploadSessions.has(dir)) {
          const dirPath = path.join(this.tempDir, dir);
          const stats = await fs.promises.stat(dirPath);
          const age = now.getTime() - stats.mtime.getTime();
          if (age > maxAgeMs) {
            await fs.promises.rm(dirPath, { recursive: true, force: true });
            this.logger.log(`Cleaned up orphaned temp directory: ${dir}`);
          }
        }
      }
    } catch (error) {
      this.logger.error('Error cleaning up temp directories:', error.message);
    }
  }
}

