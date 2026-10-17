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
});
