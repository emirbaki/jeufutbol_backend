import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface CreateCheckoutOptions {
    variantId: string;
    userId: string;
    tenantId: string;
    email: string;
    userName?: string;
    successUrl: string;
    cancelUrl: string;
}

export interface LemonSqueezySubscription {
    id: string;
    status: string;
    customerId: string;
    productId: string;
    variantId: string;
    renewsAt: string | null;
    endsAt: string | null;
    trialEndsAt: string | null;
    billingAnchor: number;
    cancelled: boolean;
}

export interface LemonSqueezyWebhookPayload {
    meta: {
        event_name: string;
        custom_data?: {
            user_id?: string;
            tenant_id?: string;
        };
    };
    data: {
        id: string;
        type: string;
        attributes: Record<string, any>;
        relationships?: Record<string, any>;
    };
}

@Injectable()
export class LemonSqueezyService {
    private readonly logger = new Logger(LemonSqueezyService.name);
    private readonly apiUrl = 'https://api.lemonsqueezy.com/v1';
    private readonly apiKey: string;
    private readonly storeId: string;
    private readonly webhookSecret: string;

    constructor(private configService: ConfigService) {
        this.apiKey = this.configService.get<string>('LEMON_SQUEEZY_API_KEY') || '';
        this.storeId = this.configService.get<string>('LEMON_SQUEEZY_STORE_ID') || '';
        this.webhookSecret = this.configService.get<string>('LEMON_SQUEEZY_WEBHOOK_SECRET') || '';

        if (!this.apiKey) {
            this.logger.warn('LEMON_SQUEEZY_API_KEY is not configured');
        }
    }

    /**
     * Create a checkout session for a subscription
     */
    async createCheckout(options: CreateCheckoutOptions): Promise<{ checkoutUrl: string }> {
        const response = await fetch(`${this.apiUrl}/checkouts`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Accept': 'application/vnd.api+json',
                'Content-Type': 'application/vnd.api+json',
            },
            body: JSON.stringify({
                data: {
                    type: 'checkouts',
                    attributes: {
                        checkout_data: {
                            email: options.email,
                            name: options.userName,
                            custom: {
                                user_id: options.userId,
                                tenant_id: options.tenantId,
                            },
                        },
                        checkout_options: {
                            subscription_preview: true,
                        },
                        product_options: {
                            redirect_url: options.successUrl,
                            receipt_button_text: 'Go to Dashboard',
                            receipt_link_url: options.successUrl,
                        },
                        // Enable 7-day trial
                        preview: true,
                    },
                    relationships: {
                        store: {
                            data: {
                                type: 'stores',
                                id: this.storeId,
                            },
                        },
                        variant: {
                            data: {
                                type: 'variants',
                                id: options.variantId,
                            },
                        },
                    },
                },
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            this.logger.error(`Failed to create checkout: ${error}`);
            throw new Error(`Failed to create checkout session: ${response.status}`);
        }

        const data = await response.json();
        return {
            checkoutUrl: data.data.attributes.url,
        };
    }

    /**
     * Get subscription details from Lemon Squeezy
     */
    async getSubscription(subscriptionId: string): Promise<LemonSqueezySubscription> {
        const response = await fetch(`${this.apiUrl}/subscriptions/${subscriptionId}`, {
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Accept': 'application/vnd.api+json',
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to get subscription: ${response.status}`);
        }

        const data = await response.json();
        const attrs = data.data.attributes;

        return {
            id: data.data.id,
            status: attrs.status,
            customerId: attrs.customer_id.toString(),
            productId: attrs.product_id.toString(),
            variantId: attrs.variant_id.toString(),
            renewsAt: attrs.renews_at,
            endsAt: attrs.ends_at,
            trialEndsAt: attrs.trial_ends_at,
            billingAnchor: attrs.billing_anchor,
            cancelled: attrs.cancelled,
        };
    }

    /**
     * Cancel a subscription (at period end)
     */
    async cancelSubscription(subscriptionId: string): Promise<void> {
        const response = await fetch(`${this.apiUrl}/subscriptions/${subscriptionId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Accept': 'application/vnd.api+json',
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to cancel subscription: ${response.status}`);
        }
    }

    /**
     * Resume a paused or cancelled subscription
     */
    async resumeSubscription(subscriptionId: string): Promise<void> {
        const response = await fetch(`${this.apiUrl}/subscriptions/${subscriptionId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Accept': 'application/vnd.api+json',
                'Content-Type': 'application/vnd.api+json',
            },
            body: JSON.stringify({
                data: {
                    type: 'subscriptions',
                    id: subscriptionId,
                    attributes: {
                        cancelled: false,
                    },
                },
            }),
        });

        if (!response.ok) {
            throw new Error(`Failed to resume subscription: ${response.status}`);
        }
    }

    /**
     * Verify webhook signature using HMAC-SHA256
     */
    verifyWebhookSignature(rawBody: string, signature: string): boolean {
        if (!this.webhookSecret) {
            this.logger.warn('Webhook secret not configured, skipping verification');
            return true; // In development, allow unverified webhooks
        }

        const hmac = crypto.createHmac('sha256', this.webhookSecret);
        const digest = hmac.update(rawBody).digest('hex');

        return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
    }

    /**
     * Parse webhook payload
     */
    parseWebhookPayload(rawBody: string): LemonSqueezyWebhookPayload {
        return JSON.parse(rawBody);
    }

    /**
     * Get variant ID for a plan
     */
    getVariantId(plan: 'pro_monthly' | 'pro_yearly'): string {
        if (plan === 'pro_monthly') {
            return this.configService.get<string>('LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_ID') || '';
        }
        return this.configService.get<string>('LEMON_SQUEEZY_PRO_YEARLY_VARIANT_ID') || '';
    }
}
