import { BadRequestException } from '@nestjs/common';
import { IMAGE_MAX_BYTES, validateImageUpload } from './image-upload';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const WEBP = [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')];

function file(mimetype: string, head: number[], size = 64): Express.Multer.File {
  const buffer = Buffer.alloc(Math.max(size, head.length));
  Buffer.from(head).copy(buffer);
  return { mimetype, buffer, size: buffer.length, originalname: 'x' } as Express.Multer.File;
}

function messageOf(f?: Express.Multer.File): string | undefined {
  try {
    validateImageUpload(f);
    return undefined;
  } catch (e) {
    expect(e).toBeInstanceOf(BadRequestException);
    return (e as Error).message;
  }
}

describe('validateImageUpload', () => {
  it('accepts a PNG, a JPEG and a WebP', () => {
    expect(messageOf(file('image/png', PNG))).toBeUndefined();
    expect(messageOf(file('image/jpeg', JPEG))).toBeUndefined();
    expect(messageOf(file('image/webp', WEBP))).toBeUndefined();
  });

  it('rejects a missing file', () => {
    expect(messageOf(undefined)).toBe('Choose an image file.');
  });

  it('rejects a file whose signature does not match', () => {
    expect(messageOf(file('image/png', JPEG))).toBe('Use a PNG, JPEG or WebP image.');
  });

  it('rejects a GIF', () => {
    expect(messageOf(file('image/gif', [...Buffer.from('GIF89a')]))).toBe('Use a PNG, JPEG or WebP image.');
  });

  it('rejects 2 MB + 1 byte', () => {
    expect(messageOf(file('image/png', PNG, IMAGE_MAX_BYTES + 1))).toBe('The image must be 2 MB or smaller.');
  });
});
