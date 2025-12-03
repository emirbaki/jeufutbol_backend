import { InputType, Field } from '@nestjs/graphql';
import { IsEmail, IsEnum } from 'class-validator';
import { UserRole } from '../../auth/user-role.enum';

@InputType()
export class InviteUserInput {
    @Field()
    @IsEmail()
    email: string;

    @Field(() => UserRole)
    @IsEnum(UserRole)
    role: UserRole;
}
