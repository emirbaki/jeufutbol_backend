import { InputType, Field } from '@nestjs/graphql';
import { IsString, IsOptional, IsBoolean, MinLength } from 'class-validator';

@InputType()
export class UpdateProfileInput {
    @Field({ nullable: true })
    @IsString()
    @IsOptional()
    firstName?: string;

    @Field({ nullable: true })
    @IsString()
    @IsOptional()
    lastName?: string;
}

@InputType()
export class ChangePasswordInput {
    @Field()
    @IsString()
    currentPassword: string;

    @Field()
    @IsString()
    @MinLength(6)
    newPassword: string;
}

@InputType()
export class UpdateNotificationSettingsInput {
    @Field({ nullable: true })
    @IsBoolean()
    @IsOptional()
    notifyOnPublish?: boolean;

    @Field({ nullable: true })
    @IsBoolean()
    @IsOptional()
    notifyOnFail?: boolean;

    @Field({ nullable: true })
    @IsBoolean()
    @IsOptional()
    notifyWeeklyReport?: boolean;

    @Field({ nullable: true })
    @IsBoolean()
    @IsOptional()
    notifyNewInsights?: boolean;
}

