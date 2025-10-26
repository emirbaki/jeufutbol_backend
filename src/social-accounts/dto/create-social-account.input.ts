import { InputType, Int, Field } from '@nestjs/graphql';

@InputType()
export class CreateSocialAccountInput {
  @Field(() => Int, { description: 'Example field (placeholder)' })
  exampleField: number;
}
