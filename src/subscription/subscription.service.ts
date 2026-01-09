import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from '../entities/subscription.entity';
import { PaymentEvent, PaymentEventStatus } from '../entities/payment-event.entity';
import { Tenant } from '../entities/tenant.entity';
import {
    SubscriptionStatus,
    SubscriptionPlan,
    BillingCycle,
} from './enums/subscription.enum';
import { LemonSqueezyService, LemonSqueezyWebhookPayload } from './lemon-squeezy.service';

@Injectable()
export class SubscriptionService {
    private readonly logger = new Logger(SubscriptionService.name);

    constructor(
        @InjectRepository(Subscription)
        private subscriptionRepository: Repository<Subscription>,
        @InjectRepository(PaymentEvent)
        private paymentEventRepository: Repository<PaymentEvent>,
        @InjectRepository(Tenant)
        private tenantRepository: Repository<Tenant>,
        private lemonSqueezyService: LemonSqueezyService,
    ) { }

    /**
     * Get subscription for a tenant
     */
    async getSubscriptionByTenantId(tenantId: string): Promise<Subscription | null> {
        return this.subscriptionRepository.findOne({
            where: { tenantId },
            relations: ['tenant'],
        });
    }

    /**
     * Get subscription by Lemon Squeezy ID
     */
    async getSubscriptionByLemonSqueezyId(lsSubscriptionId: string): Promise<Subscription | null> {
        return this.subscriptionRepository.findOne({
            where: { lemonSqueezySubscriptionId: lsSubscriptionId },
            relations: ['tenant'],
        });
    }

    /**
     * Create or update subscription from webhook data
     */
    async handleSubscriptionCreated(webhookPayload: LemonSqueezyWebhookPayload): Promise<Subscription> {
        const { data, meta } = webhookPayload;
        const attrs = data.attributes;

        const tenantId = meta.custom_data?.tenant_id;
        if (!tenantId) {
            throw new Error('tenant_id not found in webhook custom_data');
        }

        // Check if subscription already exists
        let subscription = await this.subscriptionRepository.findOne({
            where: { tenantId },
        });

        const status = this.mapLemonSqueezyStatus(attrs.status);

        if (subscription) {
            // Update existing subscription
            subscription.lemonSqueezySubscriptionId = data.id;
            subscription.lemonSqueezyCustomerId = attrs.customer_id?.toString();
            subscription.status = status;
            subscription.plan = SubscriptionPlan.PRO;
            subscription.currentPeriodStart = attrs.current_period_start ? new Date(attrs.current_period_start) : null;
            subscription.currentPeriodEnd = attrs.renews_at ? new Date(attrs.renews_at) : null;
            subscription.trialEndsAt = attrs.trial_ends_at ? new Date(attrs.trial_ends_at) : null;
            subscription.cancelAtPeriodEnd = attrs.cancelled || false;
        } else {
            // Create new subscription
            subscription = this.subscriptionRepository.create({
                tenantId,
                lemonSqueezySubscriptionId: data.id,
                lemonSqueezyCustomerId: attrs.customer_id?.toString(),
                status,
                plan: SubscriptionPlan.PRO,
                billingCycle: this.determineBillingCycle(attrs.variant_id),
                currentPeriodStart: attrs.current_period_start ? new Date(attrs.current_period_start) : null,
                currentPeriodEnd: attrs.renews_at ? new Date(attrs.renews_at) : null,
                trialEndsAt: attrs.trial_ends_at ? new Date(attrs.trial_ends_at) : null,
                cancelAtPeriodEnd: false,
                isGrandfathered: false,
            });
        }

        return this.subscriptionRepository.save(subscription);
    }

    /**
     * Handle subscription updated event
     */
    async handleSubscriptionUpdated(webhookPayload: LemonSqueezyWebhookPayload): Promise<Subscription | null> {
        const { data } = webhookPayload;
        const attrs = data.attributes;

        const subscription = await this.getSubscriptionByLemonSqueezyId(data.id);
        if (!subscription) {
            this.logger.warn(`Subscription not found for LS ID: ${data.id}`);
            return null;
        }

        subscription.status = this.mapLemonSqueezyStatus(attrs.status);
        subscription.currentPeriodStart = attrs.current_period_start ? new Date(attrs.current_period_start) : null;
        subscription.currentPeriodEnd = attrs.renews_at ? new Date(attrs.renews_at) : null;
        subscription.trialEndsAt = attrs.trial_ends_at ? new Date(attrs.trial_ends_at) : null;
        subscription.cancelAtPeriodEnd = attrs.cancelled || false;

        return this.subscriptionRepository.save(subscription);
    }

    /**
     * Handle subscription cancelled event
     */
    async handleSubscriptionCancelled(webhookPayload: LemonSqueezyWebhookPayload): Promise<Subscription | null> {
        const { data } = webhookPayload;
        const attrs = data.attributes;

        const subscription = await this.getSubscriptionByLemonSqueezyId(data.id);
        if (!subscription) {
            this.logger.warn(`Subscription not found for LS ID: ${data.id}`);
            return null;
        }

        subscription.cancelAtPeriodEnd = true;
        // Status remains active until period ends
        if (attrs.ends_at) {
            subscription.currentPeriodEnd = new Date(attrs.ends_at);
        }

        return this.subscriptionRepository.save(subscription);
    }

    /**
     * Handle subscription expired/ended event
     */
    async handleSubscriptionExpired(webhookPayload: LemonSqueezyWebhookPayload): Promise<Subscription | null> {
        const { data } = webhookPayload;

        const subscription = await this.getSubscriptionByLemonSqueezyId(data.id);
        if (!subscription) {
            this.logger.warn(`Subscription not found for LS ID: ${data.id}`);
            return null;
        }

        subscription.status = SubscriptionStatus.EXPIRED;
        subscription.plan = SubscriptionPlan.FREE;

        return this.subscriptionRepository.save(subscription);
    }

    /**
     * Handle payment success event
     */
    async handlePaymentSuccess(webhookPayload: LemonSqueezyWebhookPayload): Promise<void> {
        const { data } = webhookPayload;
        const attrs = data.attributes;

        // Find subscription by customer ID or subscription ID
        const subscriptionId = attrs.subscription_id?.toString();
        if (subscriptionId) {
            const subscription = await this.getSubscriptionByLemonSqueezyId(subscriptionId);
            if (subscription) {
                subscription.status = SubscriptionStatus.ACTIVE;
                await this.subscriptionRepository.save(subscription);
            }
        }
    }

    /**
     * Handle payment failed event
     */
    async handlePaymentFailed(webhookPayload: LemonSqueezyWebhookPayload): Promise<void> {
        const { data } = webhookPayload;
        const attrs = data.attributes;

        const subscriptionId = attrs.subscription_id?.toString();
        if (subscriptionId) {
            const subscription = await this.getSubscriptionByLemonSqueezyId(subscriptionId);
            if (subscription) {
                subscription.status = SubscriptionStatus.PAST_DUE;
                await this.subscriptionRepository.save(subscription);
            }
        }
    }

    /**
     * Log webhook event
     */
    async logPaymentEvent(
        eventType: string,
        eventId: string,
        payload: Record<string, any>,
        subscriptionId?: string,
        status: PaymentEventStatus = PaymentEventStatus.PROCESSED,
        errorMessage?: string,
    ): Promise<PaymentEvent> {
        const event = this.paymentEventRepository.create({
            eventType,
            lemonSqueezyEventId: eventId,
            subscriptionId,
            payload,
            status,
            errorMessage,
        });

        return this.paymentEventRepository.save(event);
    }

    /**
     * Check if event was already processed (idempotency)
     */
    async isEventProcessed(eventId: string): Promise<boolean> {
        const existing = await this.paymentEventRepository.findOne({
            where: { lemonSqueezyEventId: eventId },
        });
        return !!existing;
    }

    /**
     * Create a checkout URL for upgrading to Pro
     */
    async createCheckoutUrl(
        tenantId: string,
        userId: string,
        email: string,
        plan: 'pro_monthly' | 'pro_yearly',
        successUrl: string,
        cancelUrl: string,
    ): Promise<string> {
        const variantId = this.lemonSqueezyService.getVariantId(plan);
        if (!variantId) {
            throw new Error(`Variant ID not configured for plan: ${plan}`);
        }

        const result = await this.lemonSqueezyService.createCheckout({
            variantId,
            userId,
            tenantId,
            email,
            successUrl,
            cancelUrl,
        });

        return result.checkoutUrl;
    }

    /**
     * Cancel subscription for a tenant
     */
    async cancelSubscription(tenantId: string): Promise<Subscription> {
        const subscription = await this.getSubscriptionByTenantId(tenantId);
        if (!subscription) {
            throw new Error('No subscription found for tenant');
        }

        if (subscription.isGrandfathered) {
            throw new Error('Cannot cancel grandfathered subscription');
        }

        if (!subscription.lemonSqueezySubscriptionId) {
            throw new Error('No Lemon Squeezy subscription ID found');
        }

        await this.lemonSqueezyService.cancelSubscription(subscription.lemonSqueezySubscriptionId);

        subscription.cancelAtPeriodEnd = true;
        return this.subscriptionRepository.save(subscription);
    }

    /**
     * Ensure tenant has a subscription record (creates free tier if none exists)
     */
    async ensureSubscription(tenantId: string): Promise<Subscription> {
        let subscription = await this.getSubscriptionByTenantId(tenantId);

        if (!subscription) {
            subscription = this.subscriptionRepository.create({
                tenantId,
                status: SubscriptionStatus.ACTIVE,
                plan: SubscriptionPlan.FREE,
                billingCycle: BillingCycle.MONTHLY,
                isGrandfathered: false,
            });
            subscription = await this.subscriptionRepository.save(subscription);
        }

        return subscription;
    }

    /**
     * Map Lemon Squeezy status to our enum
     */
    private mapLemonSqueezyStatus(lsStatus: string): SubscriptionStatus {
        const statusMap: Record<string, SubscriptionStatus> = {
            'active': SubscriptionStatus.ACTIVE,
            'on_trial': SubscriptionStatus.ON_TRIAL,
            'cancelled': SubscriptionStatus.CANCELLED,
            'expired': SubscriptionStatus.EXPIRED,
            'past_due': SubscriptionStatus.PAST_DUE,
            'unpaid': SubscriptionStatus.UNPAID,
            'paused': SubscriptionStatus.PAUSED,
        };

        return statusMap[lsStatus] || SubscriptionStatus.ACTIVE;
    }

    /**
     * Determine billing cycle from variant ID
     */
    private determineBillingCycle(_variantId: string): BillingCycle {
        // This would ideally check against configured variant IDs
        // For now, default to monthly
        return BillingCycle.MONTHLY;
    }
}
