import { InputType, Field } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsArray, IsDateString, IsOptional } from 'class-validator';

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
}
