import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Subscription } from '../entities/subscription.entity';
import { PaymentEvent } from '../entities/payment-event.entity';
import { Tenant } from '../entities/tenant.entity';
import { User } from '../entities/user.entity';
import { ApiKey } from '../entities/api-key.entity';
import { SubscriptionService } from './subscription.service';
import { SubscriptionResolver } from './subscription.resolver';
import { LemonSqueezyService } from './lemon-squeezy.service';
import { WebhookController } from './webhook.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Subscription, PaymentEvent, Tenant, User, ApiKey]),
        ConfigModule,
        AuthModule,
    ],
    controllers: [WebhookController],
    providers: [
        SubscriptionService,
        SubscriptionResolver,
        LemonSqueezyService,
    ],
    exports: [SubscriptionService, LemonSqueezyService],
})
export class SubscriptionModule { }

