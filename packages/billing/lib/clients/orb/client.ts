import Orb from 'orb-billing';

import { Err, metrics, Ok, report, retry } from '@nangohq/utils';

import { envs } from '../../envs.js';
import {
    fromOrbAlert,
    fromOrbCustomer,
    fromOrbPeriodCosts,
    fromOrbUpcomingInvoice,
    orbMetricToUsageMetric,
    toOrbEvent,
    toOrbPutCustomerPayload
} from './adapters.js';

import type {
    BillingClient,
    BillingCustomer,
    BillingEvent,
    BillingInvoicingDetails,
    BillingOverdueInvoices,
    BillingPeriodCosts,
    BillingSpendAlert,
    BillingSubscription,
    BillingUpcomingInvoice,
    BillingUsageMetrics,
    DBTeam,
    GetBillingUsageOpts,
    Result
} from '@nangohq/types';

export class OrbClient implements BillingClient {
    private orbSDK: Orb;

    constructor() {
        this.orbSDK = new Orb({
            apiKey: envs.ORB_API_KEY || 'empty',
            maxRetries: envs.ORB_MAX_RETRIES
        });
    }

    async ingest(events: BillingEvent[]): Promise<Result<void>> {
        // Orb limit the number of events per batch to 500
        const batchSize = 500;
        for (let i = 0; i < events.length; i += batchSize) {
            const batch = events.slice(i, i + batchSize);
            try {
                const initialDelayMs = envs.ORB_RETRY_INITIAL_DELAY_MS;
                await retry(
                    () => {
                        return this.orbSDK.events.ingest({
                            events: batch.map(toOrbEvent)
                        });
                    },
                    {
                        maxAttempts: envs.ORB_RETRY_MAX_ATTEMPTS,
                        delayMs: (attempt) => initialDelayMs * 2 ** attempt + Math.random() * initialDelayMs, // exponential backoff with jitter
                        retryOnError: (e) => {
                            // retry only on 429
                            if (e instanceof Orb.APIError) {
                                return e.status === 429;
                            }
                            return false;
                        }
                    }
                );
                metrics.increment(metrics.Types.ORB_BILLING_EVENTS_INGESTED, batch.length, { success: 'true' });
            } catch (err) {
                metrics.increment(metrics.Types.ORB_BILLING_EVENTS_INGESTED, batch.length, { success: 'false' });
                return Err(new Error('failed_to_ingest_events', { cause: err }));
            }
        }
        return Ok(undefined);
    }

    async getCustomer(accountId: number): Promise<Result<BillingCustomer>> {
        try {
            const orbCustomer = await this.orbSDK.customers.fetchByExternalId(String(accountId));
            const customer = fromOrbCustomer(orbCustomer);
            return Ok(customer);
        } catch (err) {
            return Err(new Error('failed_to_get_customer', { cause: err }));
        }
    }

    async getOrCreateCustomer(accountId: number, defaultTo: Pick<BillingInvoicingDetails, 'legalEntityName' | 'email'>): Promise<Result<BillingCustomer>> {
        try {
            let orbCustomer: Orb.Customers.Customer | null = null;
            try {
                orbCustomer = await this.orbSDK.customers.fetchByExternalId(String(accountId));
            } catch (err) {
                if (!isOrbNotFoundError(err)) {
                    // propagate non 404 errors, as they're unrelated to the customer enrollment on Orb
                    throw err;
                }

                orbCustomer = await this.orbSDK.customers.create({
                    external_customer_id: String(accountId),
                    currency: 'USD',
                    name: defaultTo.legalEntityName,
                    email: defaultTo.email
                });
            }

            return Ok(fromOrbCustomer(orbCustomer));
        } catch (err) {
            return Err(new Error('failed_to_upsert_customer', { cause: err }));
        }
    }

    async putCustomer(accountId: number, invoicingDetails: BillingInvoicingDetails): Promise<Result<BillingCustomer>> {
        try {
            const payload = toOrbPutCustomerPayload(invoicingDetails);
            if (payload.isErr()) {
                return Err(payload.error);
            }

            const orbCustomer = await this.orbSDK.customers.updateByExternalId(String(accountId), payload.value);
            const customer = fromOrbCustomer(orbCustomer);
            return Ok(customer);
        } catch (err) {
            return Err(new Error('failed_to_update_customer', { cause: err }));
        }
    }

    async linkStripeToCustomer(teamId: number, customerId: string): Promise<Result<void>> {
        try {
            await this.orbSDK.customers.updateByExternalId(String(teamId), {
                payment_provider: 'stripe_charge',
                payment_provider_id: customerId,
                auto_collection: true
            });
            return Ok(undefined);
        } catch (err) {
            return Err(new Error('failed_to_link_customer', { cause: err }));
        }
    }

    async createSubscription(team: DBTeam, planExternalId: string): Promise<Result<BillingSubscription>> {
        try {
            // We want to backdate the subscription to the day the team was created to backfill the usage
            // Orb doesn't allow to backdate the subscription by more than 95 days
            // Use `upgrade` to change the subscription without backdating
            const minStartDate = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000);
            const startDate = new Date(Math.max(team.created_at.getTime(), minStartDate.getTime())).toISOString();

            const subscription = await this.orbSDK.subscriptions.create({
                external_customer_id: String(team.id),
                external_plan_id: planExternalId,
                start_date: startDate
            });
            return Ok({ id: subscription.id, planExternalId: planExternalId });
        } catch (err) {
            return Err(new Error('failed_to_create_subscription', { cause: err }));
        }
    }

    async getSubscription(accountId: number): Promise<Result<BillingSubscription | null>> {
        try {
            const subs = await this.orbSDK.subscriptions.list({ external_customer_id: [String(accountId)], status: 'active' });
            if (subs.data.length === 0) {
                return Ok(null);
            }

            const sub = subs.data[0]!;
            return Ok({
                id: sub.id,
                pendingChangeId: sub.pending_subscription_change?.id,
                planExternalId: sub.plan?.external_plan_id || ''
            });
        } catch (err) {
            return Err(new Error('failed_to_get_customer', { cause: err }));
        }
    }

    async getOverdueInvoices(accountId: number): Promise<Result<BillingOverdueInvoices>> {
        try {
            // A day of grace while Orb's own charge retries play out. Orb rejects a timestamp here and
            // matches the given date inclusively.
            const dueOnOrBefore = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

            // Pages are walked until a match: a page of fully-credited invoices doesn't end the search.
            for await (const invoice of this.orbSDK.invoices.list({
                external_customer_id: String(accountId),
                // `synced` is an issued invoice exported to external accounting — still owed.
                status: ['issued', 'synced'],
                // Orb applies the date filter to whichever field `date_type` names and defaults that to
                // `invoice_date`, where it matches every issued invoice, due or not.
                date_type: 'due_date',
                'due_date[lt]': dueOnOrBefore
            })) {
                // Orb can't filter on the amount, and a fully-credited invoice is still `issued`.
                if (Number(invoice.amount_due) > 0) {
                    return Ok({ hasOverdue: true });
                }
            }

            return Ok({ hasOverdue: false });
        } catch (err) {
            // A paying account should always have an Orb customer, but guard the
            // not-found case (e.g. never linked) as "nothing overdue" rather than error.
            if (isOrbNotFoundError(err)) {
                return Ok({ hasOverdue: false });
            }
            return Err(new Error('failed_to_get_overdue_invoices', { cause: err }));
        }
    }

    async getUpcomingInvoice(subscriptionId: string): Promise<Result<BillingUpcomingInvoice | null>> {
        try {
            const invoice = await this.orbSDK.invoices.fetchUpcoming(
                { subscription_id: subscriptionId },
                {
                    headers: {
                        'Orb-Cache-Control': 'cache',
                        'Orb-Cache-Max-Age-Seconds': '300'
                    }
                }
            );

            return Ok(fromOrbUpcomingInvoice(invoice));
        } catch (err) {
            if (isOrbNotFoundError(err) || isOrbEndedSubscriptionError(err)) {
                return Ok(null);
            }
            return Err(new Error('failed_to_get_upcoming_invoice', { cause: err }));
        }
    }

    async getPeriodCosts(subscriptionId: string): Promise<Result<BillingPeriodCosts | null>> {
        try {
            // No timeframe: Orb defaults to the current billing period. Cumulative so the last bucket
            // carries the period-to-date figure rather than a single day's.
            const costs = await this.orbSDK.subscriptions.fetchCosts(
                subscriptionId,
                { view_mode: 'cumulative' },
                {
                    headers: {
                        'Orb-Cache-Control': 'cache',
                        'Orb-Cache-Max-Age-Seconds': '300'
                    }
                }
            );

            const result = fromOrbPeriodCosts(costs, new Date());
            if (result && result.flagged.length > 0) {
                // A price we couldn't cleanly turn into a metric's charge: nothing else would signal
                // that a figure is missing, or that another metric's $0 can no longer be trusted.
                metrics.increment(metrics.Types.BILLING_PERIOD_COSTS_UNATTRIBUTED);
                report(new Error('billing_period_costs_unattributed'), {
                    subscriptionId,
                    malformedMetrics: result.malformedMetrics,
                    fullyAttributed: result.fullyAttributed,
                    flagged: result.flagged
                });
            }
            return Ok(result);
        } catch (err) {
            if (isOrbNotFoundError(err)) {
                return Ok(null);
            }
            return Err(new Error('failed_to_get_period_costs', { cause: err }));
        }
    }

    async getSpendAlert(subscriptionId: string): Promise<Result<BillingSpendAlert | null>> {
        try {
            const alert = await this.findCostAlert(subscriptionId);
            // A disabled alert is how removal is recorded — Orb has no delete for alerts — so it
            // reads as "no alert" to every caller of this function.
            if (!alert || !alert.enabled) {
                return Ok(null);
            }

            return Ok(fromOrbAlert(alert));
        } catch (err) {
            if (isOrbNotFoundError(err)) {
                return Ok(null);
            }
            return Err(new Error('failed_to_get_spend_alert', { cause: err }));
        }
    }

    async setSpendAlert(subscriptionId: string, opts: { thresholdInCents: number }): Promise<Result<BillingSpendAlert>> {
        try {
            const thresholds = [{ value: opts.thresholdInCents / 100 }];
            const existing = await this.findCostAlert(subscriptionId);

            // Orb permits only one cost_exceeded alert per subscription, and a removed one is still
            // there (disabled), so creating unconditionally would conflict.
            let alert = existing ? await this.orbSDK.alerts.update(existing.id, { thresholds }) : await this.createCostAlert(subscriptionId, thresholds);

            if (!alert.enabled) {
                alert = await this.orbSDK.alerts.enable(alert.id);
            }

            const mapped = fromOrbAlert(alert);
            if (!mapped) {
                return Err(new Error('failed_to_set_spend_alert', { cause: 'Orb returned an alert without a threshold' }));
            }

            return Ok(mapped);
        } catch (err) {
            return Err(new Error('failed_to_set_spend_alert', { cause: err }));
        }
    }

    async removeSpendAlert(subscriptionId: string): Promise<Result<void>> {
        try {
            const existing = await this.findCostAlert(subscriptionId);
            if (existing?.enabled) {
                await this.orbSDK.alerts.disable(existing.id);
            }

            return Ok(undefined);
        } catch (err) {
            if (isOrbNotFoundError(err)) {
                return Ok(undefined);
            }
            return Err(new Error('failed_to_remove_spend_alert', { cause: err }));
        }
    }

    private async createCostAlert(subscriptionId: string, thresholds: { value: number }[]): Promise<Orb.Alert> {
        try {
            return await this.orbSDK.alerts.createForSubscription(subscriptionId, { type: 'cost_exceeded', thresholds });
        } catch (err) {
            // Orb allows only one cost_exceeded alert per subscription, so this create lost a race
            // against a concurrent save. Re-read and update instead of surfacing the conflict.
            const raced = await this.findCostAlert(subscriptionId);
            if (!raced) {
                throw err;
            }
            return await this.orbSDK.alerts.update(raced.id, { thresholds });
        }
    }

    /**
     * Orb thresholds carry no id of their own, so every write has to start from the alert that
     * holds them. Listing by subscription also returns the plan-level alerts inherited from the
     * plan, which we neither own nor may edit — hence the check on the alert's own subscription.
     */
    private async findCostAlert(subscriptionId: string): Promise<Orb.Alert | null> {
        for await (const alert of this.orbSDK.alerts.list({ subscription_id: subscriptionId })) {
            if (alert.type === 'cost_exceeded' && alert.subscription?.id === subscriptionId) {
                return alert;
            }
        }

        return null;
    }

    async getUsage(subscriptionId: string, opts?: GetBillingUsageOpts): Promise<Result<BillingUsageMetrics>> {
        try {
            const options: Orb.Subscriptions.SubscriptionFetchUsageParams = {};
            if (opts?.timeframe) {
                options.timeframe_start = opts.timeframe.start.toISOString();
                options.timeframe_end = opts.timeframe.end.toISOString();
            }
            if (opts?.granularity) {
                options.granularity = 'day';
            }
            if (opts?.billingMetric) {
                options.billable_metric_id = opts.billingMetric.id;
                if (opts.billingMetric.group_by) {
                    options.group_by = opts.billingMetric.group_by;
                }
            }

            const res = await this.orbSDK.subscriptions.fetchUsage(subscriptionId, options, {
                // https://docs.withorb.com/api-reference/cached-responses
                headers: {
                    'Orb-Cache-Control': 'cache',
                    'Orb-Cache-Max-Age-Seconds': '60'
                }
            });

            const entries: BillingUsageMetrics = {};

            for (const item of res.data) {
                const usageMetric = orbMetricToUsageMetric(item.billable_metric.name);
                if (!usageMetric) {
                    continue;
                }

                const group =
                    'metric_group' in item
                        ? {
                              group: {
                                  key: item.metric_group.property_key,
                                  value: item.metric_group.property_value
                              }
                          }
                        : {};

                entries[usageMetric] = {
                    ...group,
                    externalId: item.billable_metric.id,
                    total: item.usage.reduce((sum, u) => sum + u.quantity, 0),
                    usage: item.usage.map((u) => {
                        return {
                            timeframeStart: new Date(u.timeframe_start),
                            timeframeEnd: new Date(u.timeframe_end),
                            quantity: u.quantity
                        };
                    }),
                    view_mode: 'periodic'
                };
            }

            return Ok(entries);
        } catch (err) {
            return Err(new Error('failed_to_get_usage', { cause: err }));
        }
    }

    async upgrade(opts: { subscriptionId: string; planExternalId: string }): Promise<Result<{ pendingChangeId: string; amountInCents: number | null }>> {
        try {
            // We schedule the upgrade but we don't apply it yet
            // We apply it when the first payment is made to confirm the card
            const pendingUpgrade = await this.orbSDK.subscriptions.schedulePlanChange(
                opts.subscriptionId,
                {
                    change_option: 'immediate', // It will be immediate after first payment
                    auto_collection: true,
                    external_plan_id: opts.planExternalId
                },
                { headers: { 'Create-Pending-Subscription-Change': 'true' } }
            );

            // Invoices created are ordered by due date
            // The first one is the pending one (if there was one) and the second is what we will charge
            // The following ones are for coming months
            // Since the order and numbers are unreliable, we look for the one that is payable now, and is not 0
            let amountDue = 0;
            for (const invoice of pendingUpgrade.changed_resources?.created_invoices || []) {
                if (invoice.amount_due === '0.00') {
                    continue;
                }
                if (!invoice.is_payable_now) {
                    continue;
                }
                amountDue = Number(invoice.amount_due) * 100;
                break;
            }

            return Ok({
                pendingChangeId: pendingUpgrade.pending_subscription_change!.id,
                // We return the amount due for the first invoice, it's the pending one that contains the pro-rated amount if any
                amountInCents: amountDue || null
            });
        } catch (err) {
            return Err(new Error('failed_to_upgrade_customer', { cause: err }));
        }
    }

    async downgrade(opts: { subscriptionId: string; planExternalId: string }): Promise<Result<void>> {
        try {
            await this.orbSDK.subscriptions.schedulePlanChange(opts.subscriptionId, {
                change_option: 'end_of_subscription_term',
                auto_collection: true,
                external_plan_id: opts.planExternalId
            });

            return Ok(undefined);
        } catch (err) {
            return Err(new Error('failed_to_upgrade_customer', { cause: err }));
        }
    }

    async applyPendingChanges(opts: {
        pendingChangeId: string;
        payment?: { externalId: string; amountCollected: string } | undefined;
    }): Promise<Result<BillingSubscription>> {
        try {
            const res = await this.orbSDK.subscriptionChanges.apply(
                opts.pendingChangeId,
                opts.payment
                    ? {
                          description: 'Initial payment on subscription',
                          mark_as_paid: true,
                          previously_collected_amount: opts.payment.amountCollected,
                          payment_external_id: opts.payment.externalId,
                          payment_notes: `Stripe collected: $${opts.payment.amountCollected}`
                      }
                    : {
                          // Nothing was collected up front, so there is no payment to record and no
                          // invoice to mark as paid. This happens when the plan bills fully in-arrears:
                          // Orb invoices the period at its end as usual, but with zero charges.
                          description: 'Plan change with no upfront payment'
                      }
            );

            if (!res.subscription) {
                return Err(new Error('failed_to_apply_pending_changes', { cause: 'no subscription' }));
            }

            return Ok({
                id: res.subscription.id,
                planExternalId: res.subscription.plan!.external_plan_id!
            });
        } catch (err) {
            return Err(new Error('failed_to_apply_pending_changes', { cause: err }));
        }
    }

    async cancelPendingChanges(opts: { pendingChangeId: string }): Promise<Result<void>> {
        try {
            await this.orbSDK.subscriptionChanges.cancel(opts.pendingChangeId);

            return Ok(undefined);
        } catch (err) {
            return Err(new Error('failed_to_cancel_pending_changes', { cause: err }));
        }
    }

    verifyWebhookSignature(body: string, headers: Record<string, unknown>, secret: string): Result<true> {
        try {
            this.orbSDK.webhooks.verifySignature(body, headers as any, secret);

            return Ok(true);
        } catch (err) {
            return Err(new Error('failed_to_verify_signature', { cause: err }));
        }
    }

    async getPlanById(planId: string): Promise<Result<{ id: string; external_plan_id: string }>> {
        try {
            const plan = await this.orbSDK.plans.fetch(planId);

            return Ok({ id: plan.id, external_plan_id: plan.external_plan_id! });
        } catch (err) {
            return Err(new Error('failed_to_get_plan_by_id', { cause: err }));
        }
    }
}

function isOrbNotFoundError(err: unknown): err is InstanceType<typeof Orb.NotFoundError> {
    return err instanceof Orb.NotFoundError;
}

// Orb answers a fetchUpcoming for an ended subscription with a 400 rather than a 404, and the only
// signal is the validation message. Matched narrowly so a genuinely malformed request still errors.
function isOrbEndedSubscriptionError(err: unknown): boolean {
    if (!(err instanceof Orb.BadRequestError)) {
        return false;
    }
    const errors = (err.error as { validation_errors?: unknown } | undefined)?.validation_errors;
    return Array.isArray(errors) && errors.some((e) => typeof e === 'string' && e.includes('status ended'));
}
