import {
  Controller,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  UsePipes,
  UploadedFiles,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { IsString, IsNumber, IsOptional } from 'class-validator';
import { FileValidationPipe } from './pipes/file-validation.pipe';
import { UploadService } from './upload.service';

// Multer disk storage configuration for regular uploads
const uploadPath = process.env.UPLOAD_DIR || '/var/www/uploads';
if (!existsSync(uploadPath)) mkdirSync(uploadPath, { recursive: true });

const multerConfig = {
  storage: diskStorage({
    destination: uploadPath,
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = file.originalname.split('.').pop();
      cb(null, `${file.fieldname}-${uniqueSuffix}.${ext}`);
    },
  }),
  limits: { fileSize: 300 * 1024 * 1024 }, // 300MB
};

// Memory storage for chunks (they're small, processed immediately)
const multerChunkConfig = {
  storage: memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 }, // 60MB per chunk (under Cloudflare limit)
};

// DTOs for chunked upload with class-validator decorators
class InitChunkUploadDto {
  @IsString()
  filename: string;

  @IsNumber()
  totalSize: number;

  @IsNumber()
  totalChunks: number;

  @IsString()
  @IsOptional()
  mimeType?: string;
}

class CompleteChunkUploadDto {
  @IsString()
  uploadId: string;
}


@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) { }

  @Post('single')
  @UseInterceptors(FileInterceptor('file', multerConfig))
  @UsePipes(new FileValidationPipe())
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File is required 1');
    const res = await this.uploadService.handleFileUpload(file);
    return {
      message: res.message,
      path: res.filePaths,
      filename: file.originalname,
      size: file.size,
    };
  }

  @Post('multiple')
  @UseInterceptors(FilesInterceptor('file', 10, multerConfig))
  @UsePipes(new FileValidationPipe())
  async uploadFiles(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files) throw new BadRequestException('File is required 3');
    const res = await this.uploadService.handleFileUpload(files);
    return {
      message: res.message,
      path: res.filePaths,
      filename: res.filenames,
      size: res.sizes,
    };
  }

  // ============================================
  // CHUNKED UPLOAD ENDPOINTS
  // ============================================

  /**
   * Initialize a chunked upload session
   */
  @Post('chunk/init')
  async initChunkUpload(@Body() dto: InitChunkUploadDto) {
    if (!dto.filename || !dto.totalSize || !dto.totalChunks) {
      throw new BadRequestException('Missing required fields: filename, totalSize, totalChunks');
    }

    const uploadId = await this.uploadService.initChunkUpload(
      dto.filename,
      dto.totalSize,
      dto.totalChunks,
      dto.mimeType || 'application/octet-stream',
    );

    return { uploadId };
  }

  /**
   * Upload a single chunk
   */
  @Post('chunk')
  @UseInterceptors(FileInterceptor('chunk', multerChunkConfig))
  async uploadChunk(
    @UploadedFile() chunk: Express.Multer.File,
    @Body() body: { uploadId: string; chunkIndex: string },
  ) {
    if (!chunk) throw new BadRequestException('Chunk file is required');
    if (!body.uploadId) throw new BadRequestException('uploadId is required');
    if (body.chunkIndex === undefined) throw new BadRequestException('chunkIndex is required');

    const chunkIndex = parseInt(body.chunkIndex, 10);
    if (isNaN(chunkIndex)) throw new BadRequestException('chunkIndex must be a number');

    const result = await this.uploadService.saveChunk(
      body.uploadId,
      chunkIndex,
      chunk.buffer,
    );

    return result;
  }

  /**
   * Complete chunked upload - assemble all chunks
   */
  @Post('chunk/complete')
  async completeChunkUpload(@Body() dto: CompleteChunkUploadDto) {
    if (!dto.uploadId) throw new BadRequestException('uploadId is required');

    const result = await this.uploadService.completeChunkUpload(dto.uploadId);

    return {
      message: 'File assembled successfully',
      path: result.publicUrl,
      filename: result.filename,
      size: result.size,
    };
  }
}

