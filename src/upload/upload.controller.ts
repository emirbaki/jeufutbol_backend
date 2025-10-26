import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  UsePipes,
  UploadedFiles,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { FileValidationPipe } from './pipes/file-validation.pipe';
import { UploadService } from './upload.service';

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('single')
  @UseInterceptors(FileInterceptor('file'))
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
  @UseInterceptors(FilesInterceptor('file'))
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
}
