import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { CombinedAuthGuard } from '../auth/guards/combined-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SubscriptionService } from './subscription.service';
import { Subscription } from '../entities/subscription.entity';
import { User } from '../entities/user.entity';
import { ObjectType, Field } from '@nestjs/graphql';
import { ConfigService } from '@nestjs/config';

@ObjectType()
export class CheckoutSession {
    @Field()
    checkoutUrl: string;
}

@Resolver(() => Subscription)
export class SubscriptionResolver {
    constructor(
        private subscriptionService: SubscriptionService,
        private configService: ConfigService,
    ) { }

    @Query(() => Subscription, { nullable: true })
    @UseGuards(CombinedAuthGuard)
    async mySubscription(@CurrentUser() user: User): Promise<Subscription | null> {
        if (!user?.tenantId) {
            return null;
        }

        return this.subscriptionService.getSubscriptionByTenantId(user.tenantId);
    }

    @Mutation(() => CheckoutSession)
    @UseGuards(CombinedAuthGuard)
    async createCheckout(
        @Args('plan') plan: string,
        @CurrentUser() user: User,
    ): Promise<CheckoutSession> {
        if (!user?.tenantId || !user?.id || !user?.email) {
            throw new Error('User context not found');
        }

        // Validate plan
        if (plan !== 'pro_monthly' && plan !== 'pro_yearly') {
            throw new Error('Invalid plan. Must be pro_monthly or pro_yearly');
        }

        const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:4200';
        const successUrl = `${frontendUrl}/settings/subscription?success=true`;
        const cancelUrl = `${frontendUrl}/settings/subscription?cancelled=true`;

        const checkoutUrl = await this.subscriptionService.createCheckoutUrl(
            user.tenantId,
            user.id,
            user.email,
            plan as 'pro_monthly' | 'pro_yearly',
            successUrl,
            cancelUrl,
        );

        return { checkoutUrl };
    }

    @Mutation(() => Subscription)
    @UseGuards(CombinedAuthGuard)
    async cancelSubscription(@CurrentUser() user: User): Promise<Subscription> {
        if (!user?.tenantId) {
            throw new Error('Tenant not found');
        }

        return this.subscriptionService.cancelSubscription(user.tenantId);
    }

    @Query(() => Subscription)
    @UseGuards(CombinedAuthGuard)
    async ensureSubscription(@CurrentUser() user: User): Promise<Subscription> {
        if (!user?.tenantId) {
            throw new Error('Tenant not found');
        }

        return this.subscriptionService.ensureSubscription(user.tenantId);
    }
}

