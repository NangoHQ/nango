import { uuidv7 } from 'uuidv7';

import { Err, Ok } from '@nangohq/utils';

import { putOrbCustomerSchema } from './types.js';

import type { BillingAddress, BillingCustomer, BillingEvent, BillingInvoicingDetails, Result, UsageMetric } from '@nangohq/types';
import type Orb from 'orb-billing';

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
        event_name: event.type,
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
