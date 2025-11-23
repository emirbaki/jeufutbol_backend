import { Injectable } from '@nestjs/common';
import { PlatformType } from 'src/enums/platform-type.enum';
import { PostGateway } from './gateways/post-base.gateway';
import { FacebookPostGateway } from './gateways/facebook.gateway';
import { InstagramPostGateway } from './gateways/instagram.gateway';
import { TiktokPostGateway } from './gateways/tiktok.gateway';
import { XPostGateway } from './gateways/x.gateway';

@Injectable()
export class PostGatewayFactory {
  constructor(
    private readonly facebookGateway: FacebookPostGateway,
    private readonly instagramGateway: InstagramPostGateway,
    private readonly tiktokGateway: TiktokPostGateway,
    private readonly xGateway: XPostGateway,
  ) { }

  getGateway(platform: PlatformType): PostGateway {
    switch (platform) {
      case PlatformType.FACEBOOK:
        return this.facebookGateway;
      case PlatformType.INSTAGRAM:
        return this.instagramGateway;
      case PlatformType.TIKTOK:
        return this.tiktokGateway;
      case PlatformType.X:
        return this.xGateway;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  getMany(platforms: PlatformType[]): PostGateway[] {
    return platforms.map((p) => this.getGateway(p));
  }
}
