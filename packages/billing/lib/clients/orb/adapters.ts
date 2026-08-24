import { uuidv7 } from 'uuidv7';

import { Err, Ok } from '@nangohq/utils';

import { envs } from '../../envs.js';
import { putOrbCustomerSchema } from './types.js';

import type {
    BillingAddress,
    BillingCustomer,
    BillingEvent,
    BillingInvoicingDetails,
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
 * Orb states alert thresholds as a JSON number in major units, not the decimal string invoices use,
 * so `orbAmountToCents` doesn't apply. Rounded, not truncated: we wrote this value ourselves as
 * whole cents, so any fractional remainder is float drift from the round-trip, not a real amount.
 */
export function fromOrbAlert(alert: { id: string; currency: string | null; thresholds: { value: number }[] | null }): BillingSpendAlert | null {
    const threshold = alert.thresholds?.[0];
    if (!threshold) {
        return null;
    }

    const currency = (alert.currency ?? '').trim().toUpperCase();

    return {
        id: alert.id,
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
