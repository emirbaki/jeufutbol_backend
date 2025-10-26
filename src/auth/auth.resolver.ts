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

@Resolver()
export class AuthResolver {
  constructor(private authService: AuthService) {}

  @Mutation(() => AuthPayload)
  async register(
    @Args('email') email: string,
    @Args('password') password: string,
    @Args('firstName') firstName: string,
    @Args('lastName') lastName: string,
  ): Promise<AuthPayload> {
    const { user, accessToken } = await this.authService.register(
      email,
      password,
      firstName,
      lastName,
    );
    return { user, accessToken };
  }

  @Mutation(() => AuthPayload)
  async login(
    @Args('email') email: string,
    @Args('password') password: string,
  ): Promise<AuthPayload> {
    const { user, accessToken } = await this.authService.login(email, password);
    return { user, accessToken };
  }

  @Query(() => User)
  @UseGuards(GqlAuthGuard)
  async me(@CurrentUser() user: User): Promise<User> {
    await this.authService.validateUser(user.id);
    return user;
  }
}

// GraphQL Types (you'll need to generate these with code-first approach)
@ObjectType()
class AuthPayload {
  @Field(() => User)
  user: User;

  @Field()
  accessToken: string;
}
