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
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { FileValidationPipe } from './pipes/file-validation.pipe';
import { UploadService } from './upload.service';

// Multer disk storage configuration
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
}
