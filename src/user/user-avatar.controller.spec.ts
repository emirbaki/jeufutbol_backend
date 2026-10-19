// The entities import code that imports the ESM-only uuid package.
jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { BadRequestException } from '@nestjs/common';
import { UserAvatarController } from './user-avatar.controller';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const jpegFile = { mimetype: 'image/jpeg', buffer: JPEG, size: JPEG.length, originalname: 'me.jpg' } as Express.Multer.File;

describe('UserAvatarController', () => {
  let repo: { findOne: jest.Mock; update: jest.Mock };
  let upload: { saveFile: jest.Mock; deleteFileByUrl: jest.Mock };
  let controller: UserAvatarController;

  beforeEach(() => {
    repo = { findOne: jest.fn().mockResolvedValue({ id: 'u1', avatarUrl: 'https://x/uploads/old.jpg' }), update: jest.fn() };
    upload = { saveFile: jest.fn().mockResolvedValue('https://x/uploads/new.jpg'), deleteFileByUrl: jest.fn() };
    controller = new UserAvatarController(repo as any, upload as any);
  });

  it('saves the URL on the user', async () => {
    await expect(controller.upload(jpegFile, { id: 'u1' } as any)).resolves.toEqual({
      avatarUrl: 'https://x/uploads/new.jpg',
    });
    expect(repo.update).toHaveBeenCalledWith({ id: 'u1' }, { avatarUrl: 'https://x/uploads/new.jpg' });
    expect(upload.deleteFileByUrl).toHaveBeenCalledWith('https://x/uploads/old.jpg');
  });

  it('rejects a file that is not an image', async () => {
    const bad = { ...jpegFile, mimetype: 'text/plain' } as Express.Multer.File;
    await expect(controller.upload(bad, { id: 'u1' } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('DELETE clears it and deletes the file', async () => {
    await expect(controller.remove({ id: 'u1' } as any)).resolves.toEqual({ avatarUrl: null });
    expect(repo.update).toHaveBeenCalledWith({ id: 'u1' }, { avatarUrl: null });
    expect(upload.deleteFileByUrl).toHaveBeenCalledWith('https://x/uploads/old.jpg');
  });
});
