import {
  BadRequestException,
  Controller,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadService } from '../upload/upload.service';
import { CHUNK_SIZE } from './upload-commands';
import { UploadTokenGuard, type UploadTokenRequest } from './upload-token.guard';

/** Chunk route for create_upload. It takes only the upload token, not CombinedAuthGuard. */
@Controller('mcp/uploads')
export class McpUploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post(':uploadId/chunks/:index')
  @UseGuards(UploadTokenGuard)
  @UseInterceptors(FileInterceptor('chunk', { storage: memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } }))
  async uploadChunk(
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @Param('index', ParseIntPipe) index: number,
    @Req() req: UploadTokenRequest,
    @UploadedFile() chunk: Express.Multer.File,
  ): Promise<{ received: boolean; chunkIndex: number }> {
    if (!chunk) {
      throw new BadRequestException('The chunk field is missing. Send the file as -F chunk=@<file>.');
    }
    if (chunk.size > CHUNK_SIZE) {
      throw new BadRequestException(`Chunk is larger than ${CHUNK_SIZE} bytes.`);
    }
    return this.uploadService.saveChunk(uploadId, index, chunk.buffer, req.uploadTenantId!);
  }
}
