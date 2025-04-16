import type { Endpoint } from '../api';

export type PostStripeSessionCheckout = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/stripe/checkout';
    Body: { priceKey: string };
    Success: {
        data: { url: string };
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
