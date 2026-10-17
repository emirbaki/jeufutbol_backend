import { createPostSchema, updatePostSchema } from './post.schemas';

const UUID = '3f2b8c1e-4d5a-4b6c-8e7f-9a0b1c2d3e4f';
const base = {
  content: 'Hi',
  targetPlatforms: ['youtube'],
  mediaUrls: ['https://cdn/x.mp4'],
  youtubeSettings: { title: 'T' },
};

describe('createPostSchema', () => {
  it('accepts a valid YouTube post and sets the default privacy', () => {
    expect(createPostSchema.parse(base).youtubeSettings!.privacy_status).toBe('public');
  });

  it('needs youtubeSettings for youtube', () => {
    const r = createPostSchema.safeParse({ ...base, youtubeSettings: undefined });
    expect(r.error!.issues[0]).toMatchObject({
      path: ['youtubeSettings', 'title'],
      message: 'youtubeSettings.title is required when targetPlatforms has youtube.',
    });
  });

  it('needs tiktokSettings for tiktok', () => {
    const r = createPostSchema.safeParse({ ...base, targetPlatforms: ['tiktok'], youtubeSettings: undefined });
    expect(r.error!.issues[0]).toMatchObject({
      path: ['tiktokSettings', 'privacy_level'],
      message:
        'tiktokSettings.privacy_level is required when targetPlatforms has tiktok. Call get_tiktok_creator_info for the allowed values.',
    });
  });

  it('needs a video for youtube', () => {
    const r = createPostSchema.safeParse({ ...base, mediaUrls: [] });
    expect(r.error!.issues[0]).toMatchObject({
      path: ['mediaUrls'],
      message: 'A video is required for youtube and tiktok. Call create_upload or import_media_from_url first.',
    });
  });

  it('rejects an unknown platform and a duplicate', () => {
    expect(createPostSchema.safeParse({ ...base, targetPlatforms: ['myspace'] }).success).toBe(false);
    expect(createPostSchema.safeParse({ ...base, targetPlatforms: ['youtube', 'youtube'] }).success).toBe(false);
  });

  it('rejects a media URL that is not https', () => {
    expect(createPostSchema.safeParse({ ...base, mediaUrls: ['http://cdn/x.mp4'] }).success).toBe(false);
  });

  it('rejects a past date and a date with no offset', () => {
    const past = createPostSchema.safeParse({ ...base, scheduledFor: '2020-01-01T00:00:00Z' });
    expect(past.error!.issues[0]).toMatchObject({ path: ['scheduledFor'], message: 'scheduledFor must be in the future.' });
    expect(createPostSchema.safeParse({ ...base, scheduledFor: '2099-01-01T00:00:00' }).success).toBe(false);
  });

  it('accepts a future date with an offset', () => {
    expect(createPostSchema.safeParse({ ...base, scheduledFor: '2099-01-01T10:00:00+03:00' }).success).toBe(true);
  });
});

describe('updatePostSchema', () => {
  it('accepts a postId and one field', () => {
    expect(updatePostSchema.safeParse({ postId: UUID, content: 'New' }).success).toBe(true);
  });

  it('checks the rules for the fields that are present', () => {
    const r = updatePostSchema.safeParse({ postId: UUID, targetPlatforms: ['youtube'] });
    expect(r.error!.issues[0].path).toEqual(['youtubeSettings', 'title']);
    expect(updatePostSchema.safeParse({ postId: UUID, scheduledFor: '2020-01-01T00:00:00Z' }).success).toBe(false);
  });

  it('needs a UUID', () => {
    expect(updatePostSchema.safeParse({ postId: 'nope' }).success).toBe(false);
  });
});
