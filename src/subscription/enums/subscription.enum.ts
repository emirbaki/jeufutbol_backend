export enum SubscriptionStatus {
    ACTIVE = 'active',
    ON_TRIAL = 'on_trial',
    CANCELLED = 'cancelled',
    EXPIRED = 'expired',
    PAST_DUE = 'past_due',
    UNPAID = 'unpaid',
    PAUSED = 'paused',
}

export enum SubscriptionPlan {
    FREE = 'free',
    PRO = 'pro',
    ENTERPRISE = 'enterprise',
}

export enum BillingCycle {
    MONTHLY = 'monthly',
    YEARLY = 'yearly',
}
