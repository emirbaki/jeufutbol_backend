import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { PlatformType } from '../../entities/social-account.entity';

registerEnumType(PlatformType, {
  name: 'PlatformType',
});

@ObjectType()
export class SocialAccountType {
  @Field(() => ID)
  id: string;

  @Field(() => PlatformType)
  platform: PlatformType;

  @Field()
  platformUserId: string;

  @Field()
  platformUsername: string;

  @Field({ nullable: true })
  profileImageUrl?: string;

  @Field()
  isActive: boolean;

  @Field()
  createdAt: Date;
}
