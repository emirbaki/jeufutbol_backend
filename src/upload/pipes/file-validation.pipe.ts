import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class FileValidationPipe implements PipeTransform {
  transform(value: Express.Multer.File | Express.Multer.File[]) {
    if (!value) {
      throw new BadRequestException('File is required 2');
    }

    const files = Array.isArray(value) ? value : [value];
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    const maxSize = 8 * 1024 * 1024; // 5MB

    for (const file of files) {
      if (!allowedTypes.includes(file.mimetype)) {
        throw new BadRequestException(
          `Invalid file type: ${file.mimetype}. Only JPEG, PNG, WEBP allowed.`,
        );
      }

      if (file.size > maxSize) {
        throw new BadRequestException(
          `File too large: ${file.size}. Max allowed is 8MB.`,
        );
      }
    }

    return value;
  }
}
