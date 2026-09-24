import { Audit, auditable } from './auditable.js';
import { nonEmptyString, omitUndefined } from './input.js';

import type {
    DeleteSpendAlert,
    DeleteStripePayment,
    PostPlanChange,
    PostPlanExtendTrial,
    PostStripeCollectPayment,
    PutBillingInvoicingDetails,
    PutSpendAlert
} from '@nangohq/types';

export const auditBillingPlanChanged = auditable<PostPlanChange>({
    policy: Audit.auditable({ resource: 'billing', action: 'plan_changed', scope: 'account' }),
    metadata: (req, locals) =>
        omitUndefined({
            toPlan: nonEmptyString(req.body.orbId),
            fromPlan: locals.plan?.name || undefined
        })
});

export const auditBillingTrialExtended = auditable<PostPlanExtendTrial>({
    policy: Audit.auditable({ resource: 'billing', action: 'trial_extended', scope: 'account' })
});

export const auditBillingDetailsChanged = auditable<PutBillingInvoicingDetails>({
    policy: Audit.auditable({ resource: 'billing', action: 'details_changed', scope: 'account' })
});

// SetupIntent only — pm id isn't known yet (arrives via webhook); response is just a client secret, so nothing to record.
export const auditBillingPaymentMethodAdded = auditable<PostStripeCollectPayment>({
    policy: Audit.auditable({ resource: 'billing', action: 'payment_method_added', scope: 'account' })
});

export const auditBillingPaymentMethodRemoved = auditable<DeleteStripePayment>({
    policy: Audit.auditable({ resource: 'billing', action: 'payment_method_removed', scope: 'account' }),
    metadata: (req) =>
        typeof req.query.payment_id === 'string' && req.query.payment_id.length > 0 && req.query.payment_id.length <= 255
            ? { paymentMethodId: req.query.payment_id }
            : undefined
});

export const auditBillingSpendAlertChanged = auditable<PutSpendAlert>({
    policy: Audit.auditable({ resource: 'billing', action: 'spend_alert_changed', scope: 'account' }),
    metadata: (req) => omitUndefined({ thresholdInCents: typeof req.body.thresholdInCents === 'number' ? req.body.thresholdInCents : undefined })
});

export const auditBillingSpendAlertRemoved = auditable<DeleteSpendAlert>({
    policy: Audit.auditable({ resource: 'billing', action: 'spend_alert_removed', scope: 'account' })
});
