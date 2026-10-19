import { slugify, isValidSlug, isUuid, isUniqueViolation } from './workspace.utils';

describe('workspace.utils', () => {
  it.each([
    ['Futbol Gündem', 'futbol-gundem'],
    ['  Sinema & Dizi ', 'sinema-dizi'],
    ['İstanbul ŞIK Çağ', 'istanbul-sik-cag'],
    ['Café', 'cafe'],
    ['!!!', ''],
    ['a'.repeat(50), 'a'.repeat(40)],
    [`${'a'.repeat(39)} b`, 'a'.repeat(39)],
  ])('slugify(%j) is %j', (input, out) => {
    expect(slugify(input)).toBe(out);
  });

  it.each(['football', 'cinema-2', 'ab'])('isValidSlug accepts %s', (s) => {
    expect(isValidSlug(s)).toBe(true);
  });

  it.each(['Football', 'a', '-x', 'x-', 'a--b', 'a b', 'a'.repeat(41), '123e4567-e89b-42d3-a456-426614174000'])(
    'isValidSlug rejects %s',
    (s) => expect(isValidSlug(s)).toBe(false),
  );

  it('isUuid', () => {
    expect(isUuid('123e4567-e89b-42d3-a456-426614174000')).toBe(true);
    expect(isUuid('football')).toBe(false);
  });

  it('isUniqueViolation reads code and driverError.code', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ driverError: { code: '23505' } })).toBe(true);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(new Error('x'))).toBe(false);
  });
});
