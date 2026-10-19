// The entities import code that imports the ESM-only uuid package.
jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkspaceImageController } from './workspace-image.controller';
import { UserRole } from '../auth/user-role.enum';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const pngFile = { mimetype: 'image/png', buffer: PNG, size: PNG.length, originalname: 'a.png' } as Express.Multer.File;
const admin = { id: 'u1', tenantId: 't1', role: UserRole.ADMIN } as any;

describe('WorkspaceImageController', () => {
  let repo: { findOne: jest.Mock; save: jest.Mock };
  let upload: { saveFile: jest.Mock; deleteFileByUrl: jest.Mock };
  let controller: WorkspaceImageController;
  let access: { accessFor: jest.Mock };

  beforeEach(() => {
    repo = { findOne: jest.fn(), save: jest.fn(async (x) => x) };
    upload = { saveFile: jest.fn().mockResolvedValue('https://x/uploads/new.png'), deleteFileByUrl: jest.fn() };
    access = { accessFor: jest.fn().mockResolvedValue('all') };
    controller = new WorkspaceImageController(repo as any, upload as any, access as any);
  });

  it('an API key that does not reach all branches gets Forbidden', async () => {
    access.accessFor.mockResolvedValue(['w1']);
    repo.findOne.mockResolvedValue({ id: 'w1', tenantId: 't2', imageUrl: null });
    await expect(controller.upload('w1', pngFile, undefined, { tenantId: 't2' } as any)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(upload.saveFile).not.toHaveBeenCalled();
  });

  it('USER role gets Forbidden', async () => {
    const user = { ...admin, role: UserRole.USER };
    await expect(controller.upload('w1', pngFile, user, undefined)).rejects.toBeInstanceOf(ForbiddenException);
    expect(upload.saveFile).not.toHaveBeenCalled();
  });

  it('an unknown workspace gives NotFound', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(controller.upload('w1', pngFile, admin, undefined)).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'w1', tenantId: 't1' } });
  });

  it('replacing deletes the old file', async () => {
    repo.findOne.mockResolvedValue({ id: 'w1', tenantId: 't1', imageUrl: 'https://x/uploads/old.png' });
    const out = await controller.upload('w1', pngFile, admin, undefined);
    expect(upload.saveFile).toHaveBeenCalledWith(PNG, 'image.png');
    expect(upload.deleteFileByUrl).toHaveBeenCalledWith('https://x/uploads/old.png');
    expect(out.imageUrl).toBe('https://x/uploads/new.png');
  });

  it('an API key with no user passes', async () => {
    repo.findOne.mockResolvedValue({ id: 'w1', tenantId: 't2', imageUrl: null });
    await controller.upload('w1', pngFile, undefined, { tenantId: 't2' } as any);
    expect(upload.deleteFileByUrl).not.toHaveBeenCalled();
  });

  it('DELETE clears imageUrl', async () => {
    repo.findOne.mockResolvedValue({ id: 'w1', tenantId: 't1', imageUrl: 'https://x/uploads/old.png' });
    const out = await controller.remove('w1', admin, undefined);
    expect(out.imageUrl).toBeNull();
    expect(upload.deleteFileByUrl).toHaveBeenCalledWith('https://x/uploads/old.png');
  });
});
