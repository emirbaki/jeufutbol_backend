import { InputType, Field, ID } from '@nestjs/graphql';
import { IsEmail, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { UserRole } from '../../auth/user-role.enum';
import { WorkspaceRole } from '../../entities/workspace-member.entity';

@InputType()
export class InviteUserInput {
    @Field()
    @IsEmail()
    email: string;

    @Field(() => UserRole)
    @IsEnum(UserRole)
    role: UserRole;

    /** The branch of a non-admin invitation. */
    @Field(() => ID, { nullable: true })
    @IsOptional()
    @IsUUID()
    workspaceId?: string;

    /** The role inside the branch of a non-admin invitation. */
    @Field(() => WorkspaceRole, { nullable: true })
    @IsOptional()
    @IsEnum(WorkspaceRole)
    workspaceRole?: WorkspaceRole;
}
