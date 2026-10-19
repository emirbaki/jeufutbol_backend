import { InputType, Field, ID } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsArray, IsDateString, IsOptional, IsUUID } from 'class-validator';

@InputType()
export class CreateApiKeyInput {
    @Field()
    @IsNotEmpty()
    @IsString()
    name: string;

    @Field(() => [String])
    @IsArray()
    scopes: string[];

    @Field({ nullable: true })
    @IsOptional()
    @IsDateString()
    expiresAt?: string;

    /** The branches this key can reach. Empty or missing means all branches. */
    @Field(() => [ID], { nullable: true })
    @IsOptional()
    @IsUUID('all', { each: true })
    workspaceIds?: string[];

    /** The branch for a call that names none. Must be in workspaceIds when the list is not empty. */
    @Field(() => ID, { nullable: true })
    @IsOptional()
    @IsUUID()
    defaultWorkspaceId?: string;
}
