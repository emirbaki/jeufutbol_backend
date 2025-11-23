import { registerEnumType } from '@nestjs/graphql';

export enum PlatformType {
    INSTAGRAM = 'instagram',
    FACEBOOK = 'facebook',
    X = 'x',
    TIKTOK = 'tiktok',
    YOUTUBE = 'youtube',
}

registerEnumType(PlatformType, {
    name: 'PlatformType',
    description: 'Supported social media platforms',
});
