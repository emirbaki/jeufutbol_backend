// The entities import code that imports the ESM-only uuid package.
jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

import { ForbiddenException } from '@nestjs/common';
import { ActiveWorkspacePipe, readWorkspaceHeader } from './active-workspace.decorator';

describe('readWorkspaceHeader', () => {
  it('trims the value', () => {
    expect(readWorkspaceHeader({ headers: { 'x-workspace-id': '  football ' } })).toBe('football');
  });

  it('gives null for an empty or missing header', () => {
    expect(readWorkspaceHeader({ headers: { 'x-workspace-id': '' } })).toBeNull();
    expect(readWorkspaceHeader({ headers: {} })).toBeNull();
    expect(readWorkspaceHeader(undefined)).toBeNull();
  });
});

describe('ActiveWorkspacePipe', () => {
  it('throws without a tenant', async () => {
    const pipe = new ActiveWorkspacePipe({ resolveActive: jest.fn() } as any, { accessFor: jest.fn() } as any);
    await expect(pipe.transform({ tenantId: null, headerRef: null })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('passes the context to resolveActive', async () => {
    const resolveActive = jest.fn().mockResolvedValue({ id: 'w2' });
    const accessFor = jest.fn().mockResolvedValue(['w2']);
    const pipe = new ActiveWorkspacePipe({ resolveActive } as any, { accessFor } as any);
    const user = { id: 'u1' } as any;
    await expect(pipe.transform({ tenantId: 't1', headerRef: 'football', user, apiKey: null })).resolves.toEqual({
      id: 'w2',
    });
    expect(accessFor).toHaveBeenCalledWith(user, null);
    expect(resolveActive).toHaveBeenCalledWith('t1', { headerRef: 'football', user, apiKey: null, access: ['w2'] });
  });
});
