import { InputType, Field } from '@nestjs/graphql';
import { IsBoolean, IsOptional, IsString, IsIn } from 'class-validator';

@InputType('InstagramPostSettingsInput')
export class InstagramPostSettingsInput {
    @Field(() => Boolean, { nullable: true })
    @IsOptional()
    @IsBoolean()
    isTrialReel?: boolean;

    @Field(() => String, { nullable: true })
    @IsOptional()
    @IsString()
    @IsIn(['MANUAL', 'SS_PERFORMANCE'])
    graduationStrategy?: string;
}
