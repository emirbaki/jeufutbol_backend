import { Field, InputType } from '@nestjs/graphql';
import { IsOptional, IsString, MaxLength } from 'class-validator';

@InputType()
export class CreateWorkspaceInput {
  @Field()
  @IsString()
  @MaxLength(60)
  name: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  slug?: string;
}

@InputType()
export class UpdateWorkspaceInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  slug?: string;
}
