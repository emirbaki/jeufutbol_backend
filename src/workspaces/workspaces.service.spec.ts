// The entities import code that imports the ESM-only uuid package.
jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { In, IsNull } from 'typeorm';
import { WorkspacesService } from './workspaces.service';
import { Workspace } from '../entities/workspace.entity';
import { Credential } from '../entities/credential.entity';
import { Post, PostStatus } from '../entities/post.entity';

const UUID = '123e4567-e89b-42d3-a456-426614174000';
const DEFAULT = { id: 'w1', tenantId: 't1', name: 'General', slug: 'general', isDefault: true };

describe('WorkspacesService', () => {
  let em: { update: jest.Mock; delete: jest.Mock };
  let wsRepo: any;
  let credRepo: { update: jest.Mock; count: jest.Mock };
  let postRepo: { update: jest.Mock; count: jest.Mock };
  let svc: WorkspacesService;

  beforeEach(() => {
    em = { update: jest.fn(), delete: jest.fn() };
    wsRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'w-new', ...x })),
      manager: { transaction: jest.fn(async (fn) => fn(em)) },
    };
    credRepo = { update: jest.fn(), count: jest.fn().mockResolvedValue(0) };
    postRepo = { update: jest.fn(), count: jest.fn().mockResolvedValue(0) };
    svc = new WorkspacesService(wsRepo, credRepo as any, postRepo as any);
  });

  describe('ensureDefault', () => {
    it('returns the existing default', async () => {
      wsRepo.findOne.mockResolvedValue(DEFAULT);
      await expect(svc.ensureDefault('t1')).resolves.toMatchObject({ id: 'w1' });
      expect(wsRepo.save).not.toHaveBeenCalled();
    });

    it('creates the default and moves NULL rows', async () => {
      wsRepo.findOne.mockResolvedValue(null);
      await expect(svc.ensureDefault('t1')).resolves.toMatchObject({ id: 'w-new' });
      expect(wsRepo.save).toHaveBeenCalledWith({ tenantId: 't1', name: 'General', slug: 'general', isDefault: true });
      expect(credRepo.update).toHaveBeenCalledWith({ tenantId: 't1', workspaceId: IsNull() }, { workspaceId: 'w-new' });
      expect(postRepo.update).toHaveBeenCalledWith({ tenantId: 't1', workspaceId: IsNull() }, { workspaceId: 'w-new' });
    });

    it('reads the row again after a unique violation', async () => {
      wsRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'w2' });
      wsRepo.save.mockRejectedValue({ code: '23505' });
      await expect(svc.ensureDefault('t1')).resolves.toEqual({ id: 'w2' });
    });

    it('rethrows other errors', async () => {
      wsRepo.findOne.mockResolvedValue(null);
      wsRepo.save.mockRejectedValue(new Error('db down'));
      await expect(svc.ensureDefault('t1')).rejects.toThrow('db down');
    });
  });

  describe('resolve', () => {
    it('with no ref uses the default', async () => {
      wsRepo.findOne.mockResolvedValue(DEFAULT);
      await expect(svc.resolve('t1', undefined)).resolves.toBe(DEFAULT);
      await expect(svc.resolve('t1', '  ')).resolves.toBe(DEFAULT);
      await expect(svc.resolve('t1', null)).resolves.toBe(DEFAULT);
    });

    it('finds by slug, lower case', async () => {
      wsRepo.findOne.mockResolvedValue({ id: 'w2' });
      await svc.resolve('t1', 'Football');
      expect(wsRepo.findOne).toHaveBeenCalledWith({ where: { slug: 'football', tenantId: 't1' } });
    });

    it('finds by id', async () => {
      wsRepo.findOne.mockResolvedValue({ id: UUID });
      await svc.resolve('t1', UUID);
      expect(wsRepo.findOne).toHaveBeenCalledWith({ where: { id: UUID, tenantId: 't1' } });
    });

    it('does not find a workspace of another tenant', async () => {
      wsRepo.findOne.mockResolvedValue(null);
      wsRepo.find.mockResolvedValue([{ slug: 'general' }, { slug: 'cinema' }]);
      const err = await svc.resolve('t1', UUID).catch((e) => e);
      expect(err).toBeInstanceOf(NotFoundException);
      expect(err.message).toBe(`Workspace "${UUID}" not found. Use one of: general, cinema.`);
    });
  });

  describe('create', () => {
    it('makes the slug from the name', async () => {
      await svc.create('t1', { name: ' Futbol Gündem ' });
      expect(wsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 't1', name: 'Futbol Gündem', slug: 'futbol-gundem', isDefault: false }),
      );
    });

    it('rejects a bad name and a bad slug', async () => {
      await expect(svc.create('t1', { name: '' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(svc.create('t1', { name: 'x'.repeat(61) })).rejects.toBeInstanceOf(BadRequestException);
      await expect(svc.create('t1', { name: 'x', slug: 'Bad Slug' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(svc.create('t1', { name: '!!!' })).rejects.toBeInstanceOf(BadRequestException);
      expect(wsRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a used slug', async () => {
      wsRepo.save.mockRejectedValue({ code: '23505' });
      const err = await svc.create('t1', { name: 'Football' }).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.message).toBe('The slug "football" is already used. Choose another slug.');
    });
  });

  describe('update', () => {
    it('changes the name and the slug', async () => {
      wsRepo.findOne.mockResolvedValue({ id: 'w2', tenantId: 't1', name: 'A', slug: 'a-1', isDefault: false });
      await svc.update('t1', 'w2', { name: 'Cinema', slug: 'cinema' });
      expect(wsRepo.findOne).toHaveBeenCalledWith({ where: { id: 'w2', tenantId: 't1' } });
      expect(wsRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'w2', name: 'Cinema', slug: 'cinema' }));
    });

    it('rejects an unknown id', async () => {
      wsRepo.findOne.mockResolvedValue(null);
      await expect(svc.update('t1', 'w2', { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a bad slug', async () => {
      wsRepo.findOne.mockResolvedValue({ id: 'w2', tenantId: 't1', name: 'A', slug: 'a-1', isDefault: false });
      await expect(svc.update('t1', 'w2', { slug: 'x' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('remove', () => {
    const target = { id: 'w9', tenantId: 't1', name: 'Cinema', slug: 'cinema', isDefault: false };

    it('blocks the default workspace', async () => {
      wsRepo.findOne.mockResolvedValue(DEFAULT);
      await expect(svc.remove('t1', 'w1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an unknown id', async () => {
      wsRepo.findOne.mockResolvedValue(null);
      await expect(svc.remove('t1', 'w9')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('blocks a workspace with active accounts', async () => {
      wsRepo.findOne.mockResolvedValue(target);
      credRepo.count.mockResolvedValue(2);
      const err = await svc.remove('t1', 'w9').catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toBe('Move the 2 accounts to another workspace first.');
      expect(credRepo.count).toHaveBeenCalledWith({ where: { workspaceId: 'w9', isActive: true } });
    });

    it('blocks a workspace with draft or scheduled posts', async () => {
      wsRepo.findOne.mockResolvedValue(target);
      postRepo.count.mockResolvedValue(1);
      const err = await svc.remove('t1', 'w9').catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toBe('Move or delete the 1 draft and scheduled posts first.');
      expect(postRepo.count).toHaveBeenCalledWith({
        where: { workspaceId: 'w9', status: In([PostStatus.DRAFT, PostStatus.SCHEDULED]) },
      });
    });

    it('moves old rows to the default and deletes', async () => {
      wsRepo.findOne.mockResolvedValueOnce(target).mockResolvedValueOnce(DEFAULT);
      await expect(svc.remove('t1', 'w9')).resolves.toBe(true);
      expect(em.update).toHaveBeenCalledWith(Credential, { workspaceId: 'w9', isActive: false }, { workspaceId: 'w1' });
      expect(em.update).toHaveBeenCalledWith(Post, { workspaceId: 'w9' }, { workspaceId: 'w1' });
      expect(em.delete).toHaveBeenCalledWith(Workspace, { id: 'w9', tenantId: 't1' });
    });
  });

  it('list makes sure the default exists and sorts', async () => {
    wsRepo.findOne.mockResolvedValue(DEFAULT);
    wsRepo.find.mockResolvedValue([DEFAULT]);
    await expect(svc.list('t1')).resolves.toEqual([DEFAULT]);
    expect(wsRepo.find).toHaveBeenCalledWith({ where: { tenantId: 't1' }, order: { isDefault: 'DESC', name: 'ASC' } });
  });
});
