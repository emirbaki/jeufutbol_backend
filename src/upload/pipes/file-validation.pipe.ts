import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class FileValidationPipe implements PipeTransform {
  transform(value: Express.Multer.File | Express.Multer.File[]) {
    if (!value) {
      throw new BadRequestException('File is required 2');
    }

    const files = Array.isArray(value) ? value : [value];

    // Allowed file types for images and videos
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    const allowedVideoTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'];
    const allowedTypes = [...allowedImageTypes, ...allowedVideoTypes];

    const maxImageSize = 8 * 1024 * 1024; // 8MB for images
    const maxVideoSize = 300 * 1024 * 1024; // 300MB for videos

    for (const file of files) {
      // Check file type
      if (!allowedTypes.includes(file.mimetype)) {
        throw new BadRequestException(
          `Invalid file type: ${file.mimetype}. Allowed types: JPEG, PNG, WEBP (images), MP4, MOV, WebM, AVI (videos).`,
        );
      }

      // Check file size based on type
      const isVideo = allowedVideoTypes.includes(file.mimetype);
      const maxSize = isVideo ? maxVideoSize : maxImageSize;

      if (file.size > maxSize) {
        const maxSizeMB = maxSize / (1024 * 1024);
        throw new BadRequestException(
          `File too large: ${(file.size / (1024 * 1024)).toFixed(2)}MB. Max allowed is ${maxSizeMB}MB for ${isVideo ? 'videos' : 'images'}.`,
        );
      }
    }

    return value;
  }
}
