import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { UploadTokenService } from './upload-token.service';

describe('UploadTokenService', () => {
  const jwt = new JwtService({ secret: 's' });
  let svc: UploadTokenService;

  beforeEach(() => {
    svc = new UploadTokenService(jwt);
  });

  afterEach(() => jest.useRealTimers());

  it('verifies a token for the same upload', () => {
    const { token } = svc.sign('up1', 't1');
    expect(svc.verify(token, 'up1')).toEqual({ tenantId: 't1' });
  });

  it('gives an expiry one hour from now by default', () => {
    const before = Date.now();
    const { expiresAt } = svc.sign('up1', 't1');
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 3600 * 1000 - 1000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 3600 * 1000);
  });

  it('rejects a token for a different upload', () => {
    const { token } = svc.sign('up1', 't1');
    expect(() => svc.verify(token, 'up2')).toThrow('Upload token is not valid. Call create_upload again.');
  });

  it('rejects a missing token', () => expect(() => svc.verify(undefined, 'up1')).toThrow('Upload token is not valid.'));

  it('rejects an expired token', () => {
    jest.useFakeTimers().setSystemTime(Date.now());
    const { token } = svc.sign('up1', 't1');
    jest.setSystemTime(Date.now() + 3601 * 1000);
    expect(() => svc.verify(token, 'up1')).toThrow('Upload token expired. Call create_upload again.');
    jest.useRealTimers();
  });

  it('rejects a login JWT', () => {
    const login = jwt.sign({ sub: 'u1' });
    expect(() => svc.verify(login, 'up1')).toThrow('Upload token is not valid.');
  });

  it('throws UnauthorizedException for every failure', () => {
    expect(() => svc.verify('garbage', 'up1')).toThrow(UnauthorizedException);
    expect(() => svc.verify(undefined, 'up1')).toThrow(UnauthorizedException);
  });
});
