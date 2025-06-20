import type { Endpoint } from '../api';

export type PostStripeCollectPayment = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/stripe/collect';
    Success: {
        data: { secret: string };
    };
}>;

export type GetStripePaymentMethods = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/stripe/payment_methods';
    Success: {
        data: string[];
    };
}>;

export type PostStripeWebhooks = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/stripe/webhooks';
    Body: any;
    Headers: { 'stripe-signature': string };
    Success: {
        success: boolean;
    };
}>;
