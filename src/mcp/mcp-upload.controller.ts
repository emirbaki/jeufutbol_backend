import {
  BadRequestException,
  Controller,
  Headers,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadService } from '../upload/upload.service';
import { UploadTokenService } from './upload-token.service';

/** Chunk route for create_upload. It takes only the upload token, not CombinedAuthGuard. */
@Controller('mcp/uploads')
export class McpUploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly uploadTokens: UploadTokenService,
  ) {}

  @Post(':uploadId/chunks/:index')
  @UseInterceptors(FileInterceptor('chunk', { storage: memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } }))
  async uploadChunk(
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @Param('index', ParseIntPipe) index: number,
    @Headers('x-upload-token') token: string | undefined,
    @UploadedFile() chunk: Express.Multer.File,
  ): Promise<{ received: boolean; chunkIndex: number }> {
    const { tenantId } = this.uploadTokens.verify(token, uploadId);
    if (!chunk) {
      throw new BadRequestException('The chunk field is missing. Send the file as -F chunk=@<file>.');
    }
    return this.uploadService.saveChunk(uploadId, index, chunk.buffer, tenantId);
  }
}
