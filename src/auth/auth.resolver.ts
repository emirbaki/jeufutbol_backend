import {
  Resolver,
  Mutation,
  Args,
  Query,
  Field,
  ObjectType,
} from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { GqlAuthGuard } from './guards/gql-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { User } from '../entities/user.entity';

@ObjectType()
export class AuthPayload {
  @Field(() => User)
  user: User;

  @Field()
  accessToken: string;
}

@ObjectType()
export class MessageResponse {
  @Field()
  message: string;
}

@Resolver()
export class AuthResolver {
  constructor(private authService: AuthService) {}

  @Mutation(() => MessageResponse)
  async register(
    @Args('email') email: string,
    @Args('password') password: string,
    @Args('firstName') firstName: string,
    @Args('lastName') lastName: string,
  ): Promise<any> {
    return await this.authService.register(
      email,
      password,
      firstName,
      lastName,
    );
  }

  @Query(() => MessageResponse)
  async verifyEmail(@Args('token') token: string): Promise<MessageResponse> {
    return await this.authService.verifyEmail(token);
  }

  @Mutation(() => AuthPayload)
  async login(
    @Args('email') email: string,
    @Args('password') password: string,
  ): Promise<AuthPayload> {
    const { user, accessToken } = await this.authService.login(email, password);
    return { user, accessToken };
  }

  @Mutation(() => MessageResponse)
  async requestPasswordReset(
    @Args('email') email: string,
  ): Promise<MessageResponse> {
    return await this.authService.requestPasswordReset(email);
  }

  @Mutation(() => MessageResponse)
  async resetPassword(
    @Args('token') token: string,
    @Args('newPassword') newPassword: string,
  ): Promise<MessageResponse> {
    return await this.authService.resetPassword(token, newPassword);
  }

  @Mutation(() => MessageResponse)
  @UseGuards(GqlAuthGuard)
  async resendVerificationEmail(
    @CurrentUser() user: User,
  ): Promise<MessageResponse> {
    return await this.authService.resendVerificationEmail(user.email);
  }

  @Query(() => User)
  @UseGuards(GqlAuthGuard)
  async me(@CurrentUser() user: User): Promise<User> {
    await this.authService.validateUser(user.id);
    return user;
  }
}
