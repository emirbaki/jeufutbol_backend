import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';

export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export const imageMulterOptions = { storage: memoryStorage(), limits: { fileSize: IMAGE_MAX_BYTES } };

const TYPES: Record<string, { ext: string; matches: (b: Buffer) => boolean }> = {
  'image/png': {
    ext: 'png',
    matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  'image/jpeg': { ext: 'jpg', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/webp': {
    ext: 'webp',
    matches: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
};

/** Checks the type, the file signature and the size of an uploaded image. */
export function validateImageUpload(file?: Express.Multer.File): void {
  if (!file?.buffer?.length) {
    throw new BadRequestException('Choose an image file.');
  }
  const type = TYPES[file.mimetype];
  if (!type || !type.matches(file.buffer)) {
    throw new BadRequestException('Use a PNG, JPEG or WebP image.');
  }
  if (file.buffer.length > IMAGE_MAX_BYTES) {
    throw new BadRequestException('The image must be 2 MB or smaller.');
  }
}

/**
 * A safe file name for a checked image. The extension comes from the checked
 * type, never from the uploaded name, so the server always serves an image.
 */
export function imageFileName(file: Express.Multer.File, base = 'image'): string {
  return `${base}.${TYPES[file.mimetype].ext}`;
}
