import type { ApiEndpoint } from '../api.js';
import type { AuditPolicy } from '../audit-trail/event.js';

export type PostStripeCollectPayment = ApiEndpoint<{
    Audit: AuditPolicy<'billing', 'payment_method_added', 'account'>;
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
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/api/v1/stripe/payment_methods';
    Success: {
        data: StripePaymentMethod[];
    };
}>;

export type DeleteStripePayment = ApiEndpoint<{
    Audit: AuditPolicy<'billing', 'payment_method_removed', 'account'>;
    Method: 'DELETE';
    Path: '/api/v1/stripe/payment_methods';
    Querystring: { payment_id: string };
    Success: {
        data: { deleted: boolean };
    };
}>;

export type PostStripeWebhooks = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'POST';
    Path: '/api/v1/stripe/webhooks';
    Body: any;
    Headers: { 'stripe-signature': string };
    Success: {
        success: boolean;
    };
}>;
