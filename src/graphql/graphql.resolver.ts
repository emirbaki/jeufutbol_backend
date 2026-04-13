import { ConfigService } from '@nestjs/config';
import { Query, Resolver, ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
export class PublicConfig {
  @Field()
  paymentEnabled: boolean;
}

@Resolver()
export class GraphqlResolver {
  constructor(private configService: ConfigService) { }

  @Query(() => String)
  hello() {
    return 'Hello World!';
  }

  @Query(() => PublicConfig)
  publicConfig() {
    return {
      paymentEnabled: this.configService.get<string>('PAYMENT_ENABLED') === 'true',
    };
  }
}
