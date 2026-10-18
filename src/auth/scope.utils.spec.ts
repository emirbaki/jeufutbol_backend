import { hasScopes } from './scope.utils';

describe('hasScopes', () => {
  it('gives a user all scopes', () =>
    expect(hasScopes({ isUser: true, scopes: [] }, ['posts:write'])).toBe(true));
  it('gives admin:* all scopes', () =>
    expect(hasScopes({ isUser: false, scopes: ['admin:*'] }, ['posts:delete'])).toBe(true));
  it('gives READ_ONLY all read scopes', () =>
    expect(hasScopes({ isUser: false, scopes: ['READ_ONLY'] }, ['posts:read', 'insights:read'])).toBe(true));
  it('does not give READ_ONLY a write scope', () =>
    expect(hasScopes({ isUser: false, scopes: ['READ_ONLY'] }, ['posts:write'])).toBe(false));
  it('needs each required scope', () => {
    expect(hasScopes({ isUser: false, scopes: ['posts:read'] }, ['posts:read'])).toBe(true);
    expect(hasScopes({ isUser: false, scopes: ['posts:read'] }, ['posts:read', 'posts:write'])).toBe(false);
  });
  it('allows an empty list', () =>
    expect(hasScopes({ isUser: false, scopes: [] }, [])).toBe(true));

  describe('scope text from the web app key form', () => {
    it('treats ADMIN as admin:*', () =>
      expect(hasScopes({ isUser: false, scopes: ['ADMIN'] }, ['posts:delete'])).toBe(true));
    it('gives FULL_ACCESS every granular scope', () =>
      expect(
        hasScopes({ isUser: false, scopes: ['FULL_ACCESS'] }, [
          'posts:read',
          'posts:write',
          'posts:delete',
          'credentials:read',
          'credentials:write',
          'insights:read',
          'insights:generate',
          'monitoring:read',
          'monitoring:write',
        ]),
      ).toBe(true));
    it('does not give FULL_ACCESS the admin scope', () =>
      expect(hasScopes({ isUser: false, scopes: ['FULL_ACCESS'] }, ['admin:*'])).toBe(false));
    it('matches the text exactly', () => {
      expect(hasScopes({ isUser: false, scopes: ['admin'] }, ['posts:read'])).toBe(false);
      expect(hasScopes({ isUser: false, scopes: ['Admin'] }, ['posts:read'])).toBe(false);
      expect(hasScopes({ isUser: false, scopes: ['full_access'] }, ['posts:read'])).toBe(false);
    });
  });
});
