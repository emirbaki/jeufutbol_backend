import {
    Controller,
    Post,
    Req,
    Headers,
    HttpCode,
    HttpStatus,
    Logger,
    UnauthorizedException,
    RawBodyRequest,
} from '@nestjs/common';
import { Request } from 'express';
import { LemonSqueezyService } from './lemon-squeezy.service';
import { SubscriptionService } from './subscription.service';
import { PaymentEventStatus } from '../entities/payment-event.entity';

@Controller('webhooks')
export class WebhookController {
    private readonly logger = new Logger(WebhookController.name);

    constructor(
        private lemonSqueezyService: LemonSqueezyService,
        private subscriptionService: SubscriptionService,
    ) { }

    @Post('lemon-squeezy')
    @HttpCode(HttpStatus.OK)
    async handleLemonSqueezyWebhook(
        @Req() req: RawBodyRequest<Request>,
        @Headers('x-signature') signature: string,
    ): Promise<{ received: boolean }> {
        const rawBody = req.rawBody?.toString() || '';

        // Verify webhook signature
        if (!this.lemonSqueezyService.verifyWebhookSignature(rawBody, signature || '')) {
            this.logger.warn('Invalid webhook signature received');
            throw new UnauthorizedException('Invalid signature');
        }

        try {
            const payload = this.lemonSqueezyService.parseWebhookPayload(rawBody);
            const eventName = payload.meta.event_name;
            const eventId = `${eventName}_${payload.data.id}_${Date.now()}`;

            this.logger.log(`Received webhook: ${eventName} for ${payload.data.type} ${payload.data.id}`);

            // Check idempotency
            const alreadyProcessed = await this.subscriptionService.isEventProcessed(eventId);
            if (alreadyProcessed) {
                this.logger.log(`Event ${eventId} already processed, skipping`);
                return { received: true };
            }

            // Process event based on type
            await this.processWebhookEvent(eventName, payload, eventId);

            return { received: true };
        } catch (error) {
            this.logger.error(`Error processing webhook: ${error.message}`, error.stack);

            // Still return 200 to prevent retries for parsing errors
            // Log the error for investigation
            return { received: true };
        }
    }

    private async processWebhookEvent(
        eventName: string,
        payload: any,
        eventId: string,
    ): Promise<void> {
        let subscriptionId: string | undefined;

        try {
            switch (eventName) {
                case 'subscription_created':
                    const createdSub = await this.subscriptionService.handleSubscriptionCreated(payload);
                    subscriptionId = createdSub?.id;
                    break;

                case 'subscription_updated':
                    const updatedSub = await this.subscriptionService.handleSubscriptionUpdated(payload);
                    subscriptionId = updatedSub?.id;
                    break;

                case 'subscription_cancelled':
                    const cancelledSub = await this.subscriptionService.handleSubscriptionCancelled(payload);
                    subscriptionId = cancelledSub?.id;
                    break;

                case 'subscription_expired':
                case 'subscription_ended':
                    const expiredSub = await this.subscriptionService.handleSubscriptionExpired(payload);
                    subscriptionId = expiredSub?.id;
                    break;

                case 'subscription_payment_success':
                case 'order_created':
                    await this.subscriptionService.handlePaymentSuccess(payload);
                    break;

                case 'subscription_payment_failed':
                    await this.subscriptionService.handlePaymentFailed(payload);
                    break;

                case 'subscription_payment_refunded':
                    // Just log the refund event
                    this.logger.log(`Refund processed for subscription`);
                    break;

                default:
                    this.logger.log(`Unhandled webhook event: ${eventName}`);
            }

            // Log successful event
            await this.subscriptionService.logPaymentEvent(
                eventName,
                eventId,
                payload,
                subscriptionId,
                PaymentEventStatus.PROCESSED,
            );
        } catch (error) {
            // Log failed event
            await this.subscriptionService.logPaymentEvent(
                eventName,
                eventId,
                payload,
                subscriptionId,
                PaymentEventStatus.FAILED,
                error.message,
            );
            throw error;
        }
    }
}
