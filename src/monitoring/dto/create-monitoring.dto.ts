import { Field, InputType } from '@nestjs/graphql';
import { IsString } from 'class-validator';

@InputType()
export class CreateMonitoringDto {
  @Field()
  @IsString()
  xUsername: string;

  @Field()
  @IsString()
  xUserId: string;
}
