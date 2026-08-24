import { uuidv7 } from 'uuidv7';

import { Err, Ok } from '@nangohq/utils';

import { envs } from '../../envs.js';
import { putOrbCustomerSchema } from './types.js';

import type {
    BillingAddress,
    BillingCustomer,
    BillingEvent,
    BillingInvoicingDetails,
    BillingPeriodCosts,
    BillingSpendAlert,
    BillingUpcomingInvoice,
    Result,
    UsageMetric
} from '@nangohq/types';
import type Orb from 'orb-billing';

// Keyed on the EVENT's timestamp, not the wall clock, so a batched or
// late-emitted event whose logical time is pre-cutover ships under the
// pre-cutover name and vice versa. See BILLING_EVENTS_CUTOVER_AT in
// packages/utils.
function cutoverAppliesTo(eventTimestamp: Date): boolean {
    return !!envs.BILLING_EVENTS_CUTOVER_AT && eventTimestamp >= new Date(envs.BILLING_EVENTS_CUTOVER_AT);
}

/**
 * Orb money as an integer number of cents, read off the decimal string rather than via
 * `Number(x) * 100` — that is lossy, giving 1998.9999999999998 for '19.99' instead of 1999.
 */
export function orbAmountToCents(amount: string): number | null {
    const match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(amount.trim());
    if (!match) {
        return null;
    }

    // Groups 2 and 3 are guaranteed by the pattern, but `noUncheckedIndexedAccess` can't see that.
    const whole = match[2] ?? '0';
    // Some invoices carry more than two decimals; the extra digits are dropped, not rounded.
    const fraction = match[3] ?? '';
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2));
    return match[1] === '-' ? -cents : cents;
}

/**
 * The parts of an upcoming invoice the billing summary needs, or null when the amount can't be
 * stated: an unparseable amount, or a currency that isn't ISO 4217. Orb returns the literal
 * `credits` for credit-denominated invoices, which has no dollar meaning to show a customer.
 */
export function fromOrbUpcomingInvoice(invoice: { amount_due: string; currency: string }): BillingUpcomingInvoice | null {
    const amountInCents = orbAmountToCents(invoice.amount_due);
    if (amountInCents === null) {
        return null;
    }

    const currency = invoice.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
        return null;
    }

    return { amountInCents, currency };
}

/**
 * Orb billable-metric id -> our metric. Ids are per Orb mode and prod shares none with test mode, so
 * both sets live here; names are not usable as the key because the same metric bills under several
 * (`Sync records`/`Stored records`, `Webhook forwards`/`Processed webhooks`, and so on).
 */
const orbBillableMetricToUsageMetric: Record<string, UsageMetric> = {
    // prod
    '8aAyMTG6HafmZpqJ': 'connections',
    bydJcn2HUaYSGQ9S: 'proxy',
    AinLoHESvrXqhEig: 'records',
    j46jUSMMya8jqhkR: 'webhook_forwards',
    S6QcTddptFM8tvFc: 'function_executions',
    SuusTqcXhhZVq2w4: 'function_compute_gbms',
    '7TXEdbnT3gWPqkns': 'function_logs',
    // test mode, shared by dev, staging and local
    QFf9VosRcMWkZvZq: 'connections',
    T9MRaCkFi4SEf2ku: 'proxy',
    FTTFTvuqDr7YbcRB: 'records',
    D8Gu4UPEJ3tUWJJ3: 'webhook_forwards',
    '29oZqvoENLmauqkY': 'function_executions',
    '4jYMmFPKUQAKKL2T': 'function_compute_gbms',
    '62CoZikHXhPoS6yt': 'function_logs'
};

interface OrbCostBucket {
    timeframe_end: string;
    per_price_costs: {
        total: string;
        price: { price_type: string; currency?: string | null; billable_metric?: { id: string } | null };
    }[];
}

/**
 * Per-metric charges for the subscription's current billing period, or null when they can't be stated:
 * no cost data, a period that has already closed, or a currency that isn't ISO 4217 (Orb returns the
 * literal `credits` for credit-denominated subscriptions, which has no dollar meaning).
 *
 * Fixed prices are excluded, so the metrics never sum to the period's invoice total.
 */
export function fromOrbPeriodCosts(costs: { data: OrbCostBucket[] }, now: Date): BillingPeriodCosts | null {
    // Cumulative buckets accumulate over the period, so the one ending last spans all of it. Compared
    // as instants, not strings, since the offsets need not match.
    const period = costs.data.reduce<OrbCostBucket | null>(
        (latest, bucket) => (latest && Date.parse(latest.timeframe_end) >= Date.parse(bucket.timeframe_end) ? latest : bucket),
        null
    );
    // An ended subscription still answers with its final period rather than erroring, and those costs
    // are not what is being billed now.
    if (!period || Date.parse(period.timeframe_end) <= now.getTime()) {
        return null;
    }

    const metrics: Partial<Record<UsageMetric, number>> = {};
    let unattributedInCents = 0;
    let currency: string | null = null;

    for (const priceCost of period.per_price_costs) {
        const { price } = priceCost;
        if (price.price_type === 'fixed_price') {
            continue;
        }

        const priceCurrency = price.currency?.trim().toUpperCase();
        if (!priceCurrency || !/^[A-Z]{3}$/.test(priceCurrency) || (currency && priceCurrency !== currency)) {
            return null;
        }
        currency = priceCurrency;

        // An unparseable amount on a real, priced metric means we can't trust the response — treated
        // the same as a currency mismatch above, not silently dropped: rendering the other metrics
        // while this one reads $0.00 would present malformed data as a real answer.
        const amountInCents = orbAmountToCents(priceCost.total);
        if (amountInCents === null) {
            return null;
        }

        const metric = price.billable_metric ? orbBillableMetricToUsageMetric[price.billable_metric.id] : undefined;
        if (!metric) {
            unattributedInCents += amountInCents;
            continue;
        }

        // Orb allows several prices on one metric, so accumulate rather than assign.
        metrics[metric] = (metrics[metric] ?? 0) + amountInCents;
    }

    if (!currency) {
        return null;
    }

    return { metrics, unattributedInCents, currency };
}

/**
 * Orb states alert thresholds as a JSON number in major units, not the decimal string invoices use,
 * so `orbAmountToCents` doesn't apply.
 */
export function fromOrbAlert(alert: { id: string; currency: string | null; thresholds: { value: number }[] | null }): BillingSpendAlert | null {
    const threshold = alert.thresholds?.[0];
    if (!threshold) {
        return null;
    }

    const currency = (alert.currency ?? '').trim().toUpperCase();

    return {
        id: alert.id,
        // Rounded, not truncated: we wrote this value ourselves as whole cents, so any fractional
        // remainder is float drift from the round-trip, not a real amount.
        thresholdInCents: Math.round(threshold.value * 100),
        currency: /^[A-Z]{3}$/.test(currency) ? currency : null
    };
}

export function toOrbEvent(event: BillingEvent): Orb.Events.EventIngestParams.Event {
    const { idempotencyKey, timestamp, accountId, ...rest } = event.properties;

    // orb doesn't accept nested properties, we need to flatten them with dot notation
    const properties: Record<string, string | number | boolean> = {};
    for (const [topLevelKey, value] of Object.entries(rest)) {
        if (!value) continue;
        if (typeof value === 'object') {
            for (const [k, v] of Object.entries(value)) {
                properties[`${topLevelKey}.${k}`] = v;
            }
        } else {
            properties[topLevelKey] = value;
        }
    }

    return {
        event_name: `${event.type}${cutoverAppliesTo(timestamp) ? '_http' : ''}`,
        idempotency_key: idempotencyKey || uuidv7(),
        external_customer_id: accountId.toString(),
        timestamp: timestamp.toISOString(),
        properties
    };
}

export function toOrbPutCustomerPayload(invoicingDetails: BillingInvoicingDetails): Result<Orb.CustomerUpdateByExternalIDParams> {
    const val = putOrbCustomerSchema.safeParse(invoicingDetails);
    if (!val.success) {
        return Err(val.error);
    }

    const payload: Orb.CustomerUpdateByExternalIDParams = {
        name: invoicingDetails.legalEntityName,
        email: invoicingDetails.email,
        additional_emails: val.data.additionalEmails,
        tax_id: val.data.taxId
    };

    if (val.data.address) {
        payload.billing_address = {
            country: val.data.address.country,
            line1: val.data.address.line1,
            line2: val.data.address.line2,
            city: val.data.address.city,
            state: val.data.address.state,
            postal_code: val.data.address.postalCode
        };
    } else {
        payload.billing_address = null;
    }

    return Ok(payload);
}

export function fromOrbCustomer(orbCustomer: Orb.Customer): BillingCustomer {
    return {
        id: orbCustomer.id,
        portalUrl: orbCustomer.portal_url,
        invoicingDetails: {
            legalEntityName: orbCustomer.name,
            email: orbCustomer.email,
            additionalEmails: orbCustomer.additional_emails ?? [],
            address: orbCustomer.billing_address ? fromOrbAddress(orbCustomer.billing_address) : null,
            taxId: orbCustomer.tax_id
        }
    };
}

export function fromOrbAddress(orbAddress: Orb.Address): BillingAddress {
    return {
        line1: orbAddress.line1,
        line2: orbAddress.line2,
        city: orbAddress.city,
        state: orbAddress.state,
        postalCode: orbAddress.postal_code,
        country: orbAddress.country
    };
}

export function orbMetricToUsageMetric(name: string): UsageMetric | null {
    // Not ideal to match on BillingMetric name but Orb only exposes the user friendly name or internal ids
    const lowerName = name.toLowerCase();
    // order matters here
    if (lowerName.includes('legacy')) return null;
    if (lowerName.includes('logs')) return 'function_logs';
    if (lowerName.includes('proxy')) return 'proxy';
    if (lowerName.includes('forward')) return 'webhook_forwards';
    if (lowerName.includes('compute')) return 'function_compute_gbms';
    if (lowerName.includes('function')) return 'function_executions';
    if (lowerName.includes('connections')) return 'connections';
    if (lowerName.includes('records')) return 'records';

    return null;
}
