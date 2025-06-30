import type { Endpoint } from '../api.js';

export type PostStripeCollectPayment = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/stripe/payment_methods';
    Success: {
        data: { secret: string };
    };
}>;

export type GetStripePaymentMethods = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/stripe/payment_methods';
    Success: {
        data: { id: string; last4: string }[];
    };
}>;

export type DeleteStripePayment = Endpoint<{
    Method: 'DELETE';
    Path: '/api/v1/stripe/payment_methods';
    Querystring: { payment_id: string };
    Success: {
        data: { deleted: boolean };
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
