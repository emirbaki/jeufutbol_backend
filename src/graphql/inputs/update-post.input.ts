import { InputType, PartialType } from '@nestjs/graphql';
import { CreatePostInput } from './post.input';

@InputType()
export class UpdatePostInput extends PartialType(CreatePostInput) {
  // Optional: You can add extra fields specific to updating if needed.
}
