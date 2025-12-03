import { InputType, Field } from '@nestjs/graphql';
import { IsNotEmpty, IsString, MinLength, IsEmail } from 'class-validator';

@InputType()
export class AcceptInvitationInput {
    @Field()
    @IsNotEmpty()
    @IsString()
    token: string;

    @Field()
    @IsNotEmpty()
    @IsString()
    firstName: string;

    @Field()
    @IsNotEmpty()
    @IsString()
    lastName: string;

    @Field()
    @IsEmail()
    email: string;

    @Field()
    @IsNotEmpty()
    @MinLength(8)
    password: string;
}
