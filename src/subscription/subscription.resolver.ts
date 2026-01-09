import { Resolver, Query, Mutation, Args, Context } from '@nestjs/graphql';
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
        @Context() ctx: any,
    ): Promise<CheckoutSession> {
        if (!user?.tenantId || !user?.id || !user?.email) {
            throw new Error('User context not found');
        }

        // Validate plan
        if (plan !== 'pro_monthly' && plan !== 'pro_yearly') {
            throw new Error('Invalid plan. Must be pro_monthly or pro_yearly');
        }

        // Get origin from request to support wildcard subdomains
        const req = ctx.req;
        const origin = req?.get?.('origin') || req?.headers?.origin;
        const referer = req?.get?.('referer') || req?.headers?.referer;
        const refererOrigin = referer ? referer.split('/').slice(0, 3).join('/') : null;

        // Use origin from request, fallback to env vars
        const frontendUrl = origin
            || refererOrigin
            || this.configService.get<string>('FRONTEND_URL')
            || this.configService.get<string>('FRONTEND_URL_PROD')
            || 'http://localhost:4200';

        const successUrl = `${frontendUrl}/settings?tab=billing&success=true`;
        const cancelUrl = `${frontendUrl}/settings?tab=billing&cancelled=true`;

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


