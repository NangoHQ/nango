import type { ApiEndpoint } from '../api.js';

export type PostStripeCollectPayment = ApiEndpoint<{
    Audit: { reason: 'non-auditable' };
    Method: 'POST';
    Path: '/api/v1/stripe/payment_methods';
    Success: {
        data: { secret: string };
    };
}>;

export interface StripePaymentMethod {
    id: string;
    last4: string;
}

export type GetStripePaymentMethods = ApiEndpoint<{
    Audit: { reason: 'non-auditable' };
    Method: 'GET';
    Path: '/api/v1/stripe/payment_methods';
    Success: {
        data: StripePaymentMethod[];
    };
}>;

export type DeleteStripePayment = ApiEndpoint<{
    Audit: { reason: 'non-auditable' };
    Method: 'DELETE';
    Path: '/api/v1/stripe/payment_methods';
    Querystring: { payment_id: string };
    Success: {
        data: { deleted: boolean };
    };
}>;

export type PostStripeWebhooks = ApiEndpoint<{
    Audit: { reason: 'non-auditable' };
    Method: 'POST';
    Path: '/api/v1/stripe/webhooks';
    Body: any;
    Headers: { 'stripe-signature': string };
    Success: {
        success: boolean;
    };
}>;
