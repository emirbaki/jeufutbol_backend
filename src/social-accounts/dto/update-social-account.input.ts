import { CreateSocialAccountInput } from './create-social-account.input';
import { InputType, Field, Int, PartialType } from '@nestjs/graphql';

@InputType()
export class UpdateSocialAccountInput extends PartialType(
  CreateSocialAccountInput,
) {
  @Field(() => Int)
  id: number;
}
