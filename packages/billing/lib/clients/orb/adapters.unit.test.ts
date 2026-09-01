import { describe, expect, it, vi } from 'vitest';

import { envs } from '../../envs.js';
import {
    fromOrbAddress,
    fromOrbAlert,
    fromOrbCustomer,
    fromOrbPeriodCosts,
    fromOrbUpcomingInvoice,
    orbAmountToCents,
    orbMetricToUsageMetric,
    toOrbEvent,
    toOrbPutCustomerPayload
} from './adapters.js';

import type { BillingEvent, BillingInvoicingDetails } from '@nangohq/types';
import type Orb from 'orb-billing';

vi.mock('uuidv7', () => ({ uuidv7: () => 'mock-uuid' }));

// ─── toOrbEvent ───────────────────────────────────────────────────────────────

describe('toOrbEvent', () => {
    const baseProperties = {
        idempotencyKey: 'idem-123',
        timestamp: new Date('2024-01-15T10:00:00Z'),
        accountId: 42
    };

    it('maps top-level scalar properties directly', () => {
        const event: BillingEvent = {
            type: 'proxy',
            properties: { ...baseProperties, someString: 'hello', someNumber: 7, someBool: true } as any
        };
        const result = toOrbEvent(event);
        expect(result.properties).toMatchObject({ someString: 'hello', someNumber: 7, someBool: true });
    });

    it('flattens nested object properties with dot notation', () => {
        const event: BillingEvent = {
            type: 'function_executions',
            properties: { ...baseProperties, telemetry: { successes: 10, failures: 2 } } as any
        };
        const result = toOrbEvent(event);
        expect(result.properties).toMatchObject({ 'telemetry.successes': 10, 'telemetry.failures': 2 });
        expect(result.properties).not.toHaveProperty('telemetry');
    });

    it('skips falsy top-level properties', () => {
        const event: BillingEvent = {
            type: 'proxy',
            properties: { ...baseProperties, nullProp: null, zeroProp: 0, falseProp: false } as any
        };
        const result = toOrbEvent(event);
        expect(result.properties).not.toHaveProperty('nullProp');
        expect(result.properties).not.toHaveProperty('zeroProp');
        expect(result.properties).not.toHaveProperty('falseProp');
    });

    it('uses provided idempotencyKey', () => {
        const event: BillingEvent = { type: 'proxy', properties: { ...baseProperties } as any };
        const result = toOrbEvent(event);
        expect(result.idempotency_key).toBe('idem-123');
    });

    it('generates a uuid when idempotencyKey is absent', () => {
        const { idempotencyKey: _, ...propertiesWithoutKey } = baseProperties;
        const event: BillingEvent = { type: 'proxy', properties: { ...propertiesWithoutKey } as any };
        const result = toOrbEvent(event);
        expect(result.idempotency_key).toBe('mock-uuid');
    });

    it('sets event_name, external_customer_id and timestamp correctly', () => {
        const event: BillingEvent = { type: 'proxy', properties: { ...baseProperties } as any };
        const result = toOrbEvent(event);
        expect(result.event_name).toBe('proxy');
        expect(result.external_customer_id).toBe('42');
        expect(result.timestamp).toBe('2024-01-15T10:00:00.000Z');
    });

    it('appends "_http" when the event timestamp is at or after the cutover', () => {
        const originalCutover = envs.BILLING_EVENTS_CUTOVER_AT;
        try {
            (envs as any).BILLING_EVENTS_CUTOVER_AT = '2000-01-01T00:00:00Z';
            const event: BillingEvent = { type: 'proxy', properties: { ...baseProperties } as any };
            expect(toOrbEvent(event).event_name).toBe('proxy_http');
        } finally {
            (envs as any).BILLING_EVENTS_CUTOVER_AT = originalCutover;
        }
    });

    it('does not append "_http" when the event timestamp is before the cutover', () => {
        const originalCutover = envs.BILLING_EVENTS_CUTOVER_AT;
        try {
            (envs as any).BILLING_EVENTS_CUTOVER_AT = '9999-01-01T00:00:00Z';
            const event: BillingEvent = { type: 'proxy', properties: { ...baseProperties } as any };
            expect(toOrbEvent(event).event_name).toBe('proxy');
        } finally {
            (envs as any).BILLING_EVENTS_CUTOVER_AT = originalCutover;
        }
    });

    it('keys the suffix on each event timestamp independently — a batched pre-cutover event stays unsuffixed even when processed after cutover', () => {
        // Same cutover instant, two events on either side of it: verifies the
        // suffix is decided per-event, not from wall-clock at processing time.
        const originalCutover = envs.BILLING_EVENTS_CUTOVER_AT;
        try {
            (envs as any).BILLING_EVENTS_CUTOVER_AT = '2024-06-01T00:00:00Z';
            const beforeCutover: BillingEvent = {
                type: 'proxy',
                properties: { ...baseProperties, timestamp: new Date('2024-05-31T23:59:59.999Z') } as any
            };
            const atCutover: BillingEvent = {
                type: 'proxy',
                properties: { ...baseProperties, timestamp: new Date('2024-06-01T00:00:00.000Z') } as any
            };
            expect(toOrbEvent(beforeCutover).event_name).toBe('proxy');
            expect(toOrbEvent(atCutover).event_name).toBe('proxy_http');
        } finally {
            (envs as any).BILLING_EVENTS_CUTOVER_AT = originalCutover;
        }
    });
});

// ─── toOrbPutCustomerPayload ──────────────────────────────────────────────────

describe('toOrbPutCustomerPayload', () => {
    const base: BillingInvoicingDetails = {
        legalEntityName: 'Acme Corp',
        email: 'billing@acme.com',
        additionalEmails: [],
        address: null,
        taxId: null
    };

    it('sets name and email', () => {
        const result = toOrbPutCustomerPayload(base);
        expect(result.isOk()).toBe(true);
        const value = result.unwrap();
        expect(value.name).toBe('Acme Corp');
        expect(value.email).toBe('billing@acme.com');
    });

    it('sets additional_emails', () => {
        const result = toOrbPutCustomerPayload({ ...base, additionalEmails: ['ap@acme.com', 'finance@acme.com'] });
        expect(result.isOk()).toBe(true);
        const value = result.unwrap();
        expect(value.additional_emails).toEqual(['ap@acme.com', 'finance@acme.com']);
    });

    it('sets billing_address to null when address is null', () => {
        const result = toOrbPutCustomerPayload(base);
        expect(result.isOk()).toBe(true);
        const value = result.unwrap();
        expect(value.billing_address).toBeNull();
    });

    it('sets tax_id to null when taxId is null', () => {
        const result = toOrbPutCustomerPayload(base);
        expect(result.isOk()).toBe(true);
        const value = result.unwrap();
        expect(value.tax_id).toBeNull();
    });

    it('maps a full address', () => {
        const details: BillingInvoicingDetails = {
            ...base,
            address: { line1: '123 Main St', line2: 'Suite 100', city: 'San Francisco', state: 'CA', postalCode: '94105', country: 'US' }
        };
        const result = toOrbPutCustomerPayload(details);
        expect(result.isOk()).toBe(true);
        const value = result.unwrap();
        expect(value.billing_address).toMatchObject({
            country: 'US',
            line1: '123 Main St',
            line2: 'Suite 100',
            city: 'San Francisco',
            state: 'CA',
            postal_code: '94105'
        });
    });

    it('maps a full address, even null fields', () => {
        const details: BillingInvoicingDetails = {
            ...base,
            address: { line1: '123 Main St', line2: null, city: null, state: null, postalCode: null, country: 'US' }
        };
        const result = toOrbPutCustomerPayload(details);
        expect(result.isOk()).toBe(true);
        const value = result.unwrap();
        expect(value.billing_address).toMatchObject({ country: 'US', line1: '123 Main St', line2: null, city: null, state: null, postal_code: null });
    });

    it('maps a tax ID', () => {
        const details: BillingInvoicingDetails = {
            ...base,
            taxId: { country: 'US', type: 'us_ein', value: '12-3456789' }
        };
        const result = toOrbPutCustomerPayload(details);
        expect(result.isOk()).toBe(true);
        const value = result.unwrap();
        expect(value.tax_id).toMatchObject({ country: 'US', type: 'us_ein', value: '12-3456789' });
    });

    it('returns Err for invalid email', () => {
        const result = toOrbPutCustomerPayload({ ...base, email: 'not-an-email' });
        expect(result.isErr()).toBe(true);
    });

    it('returns Err for invalid tax ID country', () => {
        const details: BillingInvoicingDetails = {
            ...base,
            taxId: { country: 'XX', type: 'us_ein', value: '12-3456789' }
        };
        const result = toOrbPutCustomerPayload(details);
        expect(result.isErr()).toBe(true);
    });

    it('returns Err for invalid tax ID type', () => {
        const details: BillingInvoicingDetails = {
            ...base,
            taxId: { country: 'US', type: 'invalid_type', value: '12-3456789' }
        };
        const result = toOrbPutCustomerPayload(details);
        expect(result.isErr()).toBe(true);
    });
});

// ─── fromOrbCustomer ──────────────────────────────────────────────────────────

describe('fromOrbCustomer', () => {
    const orbCustomer = {
        id: 'orb_123',
        portal_url: 'https://portal.example.com',
        name: 'Acme Corp',
        email: 'billing@acme.com',
        additional_emails: ['ap@acme.com'],
        billing_address: null,
        tax_id: null
    } as unknown as Orb.Customer;

    it('maps id, portalUrl and invoicingDetails', () => {
        const result = fromOrbCustomer(orbCustomer);
        expect(result.id).toBe('orb_123');
        expect(result.portalUrl).toBe('https://portal.example.com');
        expect(result.invoicingDetails.legalEntityName).toBe('Acme Corp');
        expect(result.invoicingDetails.email).toBe('billing@acme.com');
        expect(result.invoicingDetails.additionalEmails).toEqual(['ap@acme.com']);
    });

    it('sets address to null when billing_address is null', () => {
        const result = fromOrbCustomer(orbCustomer);
        expect(result.invoicingDetails.address).toBeNull();
    });

    it('sets taxId to null when tax_id is null', () => {
        const result = fromOrbCustomer(orbCustomer);
        expect(result.invoicingDetails.taxId).toBeNull();
    });

    it('maps billing_address when present', () => {
        const customer = {
            ...orbCustomer,
            billing_address: { line1: '123 Main St', line2: null, city: 'SF', state: 'CA', postal_code: '94105', country: 'US' }
        } as unknown as Orb.Customer;
        const result = fromOrbCustomer(customer);
        expect(result.invoicingDetails.address).toMatchObject({
            line1: '123 Main St',
            line2: null,
            city: 'SF',
            state: 'CA',
            postalCode: '94105',
            country: 'US'
        });
    });

    it('maps tax_id when present', () => {
        const customer = {
            ...orbCustomer,
            tax_id: { country: 'US', type: 'us_ein', value: '12-3456789' }
        } as unknown as Orb.Customer;
        const result = fromOrbCustomer(customer);
        expect(result.invoicingDetails.taxId).toMatchObject({ country: 'US', type: 'us_ein', value: '12-3456789' });
    });
});

// ─── fromOrbAddress ───────────────────────────────────────────────────────────

describe('fromOrbAddress', () => {
    it('maps all fields including postal_code → postalCode', () => {
        const orbAddress = { line1: '1 St', line2: 'Apt 2', city: 'NY', state: 'NY', postal_code: '10001', country: 'US' } as Orb.Address;
        expect(fromOrbAddress(orbAddress)).toEqual({ line1: '1 St', line2: 'Apt 2', city: 'NY', state: 'NY', postalCode: '10001', country: 'US' });
    });

    it('passes through null fields', () => {
        const orbAddress = { line1: null, line2: null, city: null, state: null, postal_code: null, country: 'US' } as Orb.Address;
        expect(fromOrbAddress(orbAddress)).toEqual({ line1: null, line2: null, city: null, state: null, postalCode: null, country: 'US' });
    });
});

// ─── orbMetricToUsageMetric ───────────────────────────────────────────────────

describe('orbMetricToUsageMetric', () => {
    it('"legacy" takes precedence over all other keywords', () => {
        // Each keyword combined with "legacy" should return null
        expect(orbMetricToUsageMetric('Legacy Logs')).toBeNull();
        expect(orbMetricToUsageMetric('Legacy Proxy')).toBeNull();
        expect(orbMetricToUsageMetric('Legacy Forward')).toBeNull();
        expect(orbMetricToUsageMetric('Legacy Compute')).toBeNull();
        expect(orbMetricToUsageMetric('Legacy Function')).toBeNull();
        expect(orbMetricToUsageMetric('Legacy Connections')).toBeNull();
        expect(orbMetricToUsageMetric('Legacy Records')).toBeNull();
    });

    it('maps the exact function runtime metric before generic keyword matching', () => {
        expect(orbMetricToUsageMetric('Function runtime (s)')).toBe('function_duration_seconds');
        expect(orbMetricToUsageMetric('FUNCTION RUNTIME (S)')).toBe('function_duration_seconds');
    });

    it('"logs" takes precedence over "proxy", "forward", "compute", "function", "connections", "records"', () => {
        expect(orbMetricToUsageMetric('Proxy Logs')).toBe('function_logs');
        expect(orbMetricToUsageMetric('Forward Logs')).toBe('function_logs');
        expect(orbMetricToUsageMetric('Compute Logs')).toBe('function_logs');
        expect(orbMetricToUsageMetric('Function Logs')).toBe('function_logs');
        expect(orbMetricToUsageMetric('Connections Logs')).toBe('function_logs');
        expect(orbMetricToUsageMetric('Records Logs')).toBe('function_logs');
    });

    it('"proxy" takes precedence over "forward", "compute", "function", "connections", "records"', () => {
        expect(orbMetricToUsageMetric('Forward Proxy')).toBe('proxy');
        expect(orbMetricToUsageMetric('Compute Proxy')).toBe('proxy');
        expect(orbMetricToUsageMetric('Function Proxy')).toBe('proxy');
        expect(orbMetricToUsageMetric('Connections Proxy')).toBe('proxy');
        expect(orbMetricToUsageMetric('Records Proxy')).toBe('proxy');
    });

    it('"forward" takes precedence over "compute", "function", "connections", "records"', () => {
        expect(orbMetricToUsageMetric('Compute Forward')).toBe('webhook_forwards');
        expect(orbMetricToUsageMetric('Function Forward')).toBe('webhook_forwards');
        expect(orbMetricToUsageMetric('Connections Forward')).toBe('webhook_forwards');
        expect(orbMetricToUsageMetric('Records Forward')).toBe('webhook_forwards');
    });

    it('"compute" takes precedence over "function", "connections", "records"', () => {
        expect(orbMetricToUsageMetric('Function Compute')).toBe('function_compute_gbms');
        expect(orbMetricToUsageMetric('Connections Compute')).toBe('function_compute_gbms');
        expect(orbMetricToUsageMetric('Records Compute')).toBe('function_compute_gbms');
    });

    it('"function" takes precedence over "connections" and "records"', () => {
        expect(orbMetricToUsageMetric('Connections Function')).toBe('function_executions');
        expect(orbMetricToUsageMetric('Records Function')).toBe('function_executions');
    });

    it('"connections" takes precedence over "records"', () => {
        expect(orbMetricToUsageMetric('Records Connections')).toBe('connections');
    });

    it('returns null for unrecognized metric names', () => {
        const unknownMetrics = ['Sbroblous', 'Foobar', 'Qux'];
        unknownMetrics.forEach((metric) => {
            expect(orbMetricToUsageMetric(metric)).toBeNull();
        });
    });

    it('is case-insensitive', () => {
        expect(orbMetricToUsageMetric('PROXY CALLS')).toBe('proxy');
        expect(orbMetricToUsageMetric('function logs')).toBe('function_logs');
    });
});
describe('orbAmountToCents', () => {
    it('parses a plain decimal amount to integer cents', () => {
        expect(orbAmountToCents('0.00')).toBe(0);
        expect(orbAmountToCents('0.07')).toBe(7);
        expect(orbAmountToCents('149.00')).toBe(14900);
        expect(orbAmountToCents('1284.30')).toBe(128430);
    });

    it('does not lose precision the way Number(x) * 100 does', () => {
        // Number('19.99') * 100 is 1998.9999999999998, which is not a valid cent amount.
        const cents = orbAmountToCents('19.99');
        expect(cents).toBe(1999);
        expect(Number.isInteger(cents)).toBe(true);
    });

    it('accepts amounts with no decimal part', () => {
        expect(orbAmountToCents('100')).toBe(10000);
    });

    it('drops sub-cent precision rather than rounding up', () => {
        expect(orbAmountToCents('19.9900000000')).toBe(1999);
        expect(orbAmountToCents('19.999')).toBe(1999);
        expect(orbAmountToCents('19.9')).toBe(1990);
        expect(orbAmountToCents('19.')).toBe(1900);
    });

    it('handles negative amounts', () => {
        expect(orbAmountToCents('-5.00')).toBe(-500);
    });

    it('returns null for anything that is not a plain decimal', () => {
        expect(orbAmountToCents('')).toBeNull();
        expect(orbAmountToCents('abc')).toBeNull();
        expect(orbAmountToCents('1.2.3')).toBeNull();
        expect(orbAmountToCents('1,284.30')).toBeNull();
        expect(orbAmountToCents('$19.99')).toBeNull();
    });
});

describe('fromOrbUpcomingInvoice', () => {
    it('maps amount and currency', () => {
        expect(fromOrbUpcomingInvoice({ amount_due: '1284.30', currency: 'USD' })).toEqual({ amountInCents: 128430, currency: 'USD' });
    });

    it('uppercases the currency', () => {
        expect(fromOrbUpcomingInvoice({ amount_due: '10.00', currency: 'usd' })).toEqual({ amountInCents: 1000, currency: 'USD' });
    });

    it('passes through non-USD currencies', () => {
        expect(fromOrbUpcomingInvoice({ amount_due: '10.00', currency: 'EUR' })).toEqual({ amountInCents: 1000, currency: 'EUR' });
    });

    it('returns null for a credit-denominated invoice', () => {
        expect(fromOrbUpcomingInvoice({ amount_due: '10.00', currency: 'credits' })).toBeNull();
    });

    it('returns null for an unparseable amount', () => {
        expect(fromOrbUpcomingInvoice({ amount_due: 'n/a', currency: 'USD' })).toBeNull();
    });
});

describe('fromOrbAlert', () => {
    it('maps the threshold to cents and uppercases the currency', () => {
        expect(fromOrbAlert({ id: 'alert_1', currency: 'usd', thresholds: [{ value: 50 }] })).toEqual({
            id: 'alert_1',
            thresholdInCents: 5000,
            currency: 'USD'
        });
    });

    it('rounds a fractional threshold to the nearest cent', () => {
        expect(fromOrbAlert({ id: 'alert_1', currency: 'USD', thresholds: [{ value: 19.99 }] })?.thresholdInCents).toBe(1999);
        expect(fromOrbAlert({ id: 'alert_1', currency: 'USD', thresholds: [{ value: 0.07 }] })?.thresholdInCents).toBe(7);
    });

    it('reads only the first threshold, since we only ever write one', () => {
        expect(fromOrbAlert({ id: 'alert_1', currency: 'USD', thresholds: [{ value: 50 }, { value: 100 }] })?.thresholdInCents).toBe(5000);
    });

    it('returns null when the alert carries no threshold', () => {
        expect(fromOrbAlert({ id: 'alert_1', currency: 'USD', thresholds: [] })).toBeNull();
        expect(fromOrbAlert({ id: 'alert_1', currency: 'USD', thresholds: null })).toBeNull();
    });

    it('keeps the threshold but drops a currency that is not ISO 4217', () => {
        expect(fromOrbAlert({ id: 'alert_1', currency: 'credits', thresholds: [{ value: 50 }] })).toEqual({
            id: 'alert_1',
            thresholdInCents: 5000,
            currency: null
        });
        expect(fromOrbAlert({ id: 'alert_1', currency: null, thresholds: [{ value: 50 }] })?.currency).toBeNull();
    });
});

const NOW = new Date('2026-08-21T12:00:00Z');
/** Ids are real: the prod and test-mode `Sync records` metrics, which share no id. */
const RECORDS_PROD = 'AinLoHESvrXqhEig';
const RECORDS_TEST = 'FTTFTvuqDr7YbcRB';
const WEBHOOKS_PROD = 'j46jUSMMya8jqhkR';
/** Read off the `pay-as-you-go` plan's prices: the metric list carries near-duplicates by name. */
const CONNECTIONS_V3_TEST = 'd43sZsrkdUE9gCUv';
const COMPUTE_HOURS_TEST = '5wA8CWsfttHSaTw3';
const DATA_TRANSFER_TEST = 'cJe5pcF2MQ8pvBrF';
const COMPUTE_HOURS_PROD = 'ZrAoynYimCwtmFSP';
const DATA_TRANSFER_PROD = 'RNskBsYUvTYLsjV2';
const CONNECTIONS_PROD = '8aAyMTG6HafmZpqJ';

function usagePrice(metricId: string | null, total: string, name = 'Some price', priceId = 'price_1') {
    return {
        price_id: priceId,
        total,
        price: { price_type: 'usage_price', currency: 'USD', name, billable_metric: metricId ? { id: metricId } : null }
    };
}

function bucket(perPriceCosts: ReturnType<typeof usagePrice>[], timeframeEnd = '2026-09-01T00:00:00+00:00') {
    return { timeframe_end: timeframeEnd, per_price_costs: perPriceCosts };
}

describe('fromOrbPeriodCosts', () => {
    it('maps a price to its metric and converts the amount to cents', () => {
        const costs = { data: [bucket([usagePrice(RECORDS_PROD, '23.17', 'Sync records')])] };

        expect(fromOrbPeriodCosts(costs, NOW)).toEqual({
            metrics: { records: 2317 },
            malformedMetrics: [],
            fullyAttributed: true,
            flagged: [],
            currency: 'USD'
        });
    });

    it('maps test-mode ids too, so the figures are not prod-only', () => {
        const costs = { data: [bucket([usagePrice(RECORDS_TEST, '1.00', 'Sync records')])] };

        expect(fromOrbPeriodCosts(costs, NOW)?.metrics).toEqual({ records: 100 });
    });

    it('maps the metrics the new pricing bills on', () => {
        const costs = {
            data: [
                bucket([
                    usagePrice(CONNECTIONS_V3_TEST, '9.86', 'ConnectionsV3', 'price_1'),
                    usagePrice(COMPUTE_HOURS_TEST, '44.86', 'Function compute time (h)', 'price_2'),
                    usagePrice(DATA_TRANSFER_TEST, '6.20', 'Data transfer (GB)', 'price_3')
                ])
            ]
        };

        const result = fromOrbPeriodCosts(costs, NOW);
        expect(result?.metrics).toEqual({ connections: 986, function_duration_seconds: 4486, data_transfer: 620 });
        expect(result?.flagged).toEqual([]);
        expect(result?.fullyAttributed).toBe(true);
    });

    it('maps the new metrics in prod, where connections keeps the id the old plans use', () => {
        const costs = {
            data: [
                bucket([
                    usagePrice(CONNECTIONS_PROD, '9.86', 'Connections', 'price_1'),
                    usagePrice(COMPUTE_HOURS_PROD, '44.86', 'Function compute time (h)', 'price_2'),
                    usagePrice(DATA_TRANSFER_PROD, '6.20', 'Data transfer (GB)', 'price_3')
                ])
            ]
        };

        const result = fromOrbPeriodCosts(costs, NOW);
        expect(result?.metrics).toEqual({ connections: 986, function_duration_seconds: 4486, data_transfer: 620 });
        expect(result?.fullyAttributed).toBe(true);
    });

    it('maps on the id, not the name, so a renamed price still lands', () => {
        // Prod subscriptions bill webhook forwarding under this name; matching on the name drops it.
        const costs = { data: [bucket([usagePrice(WEBHOOKS_PROD, '2.24', 'Processed webhooks')])] };

        expect(fromOrbPeriodCosts(costs, NOW)?.metrics).toEqual({ webhook_forwards: 224 });
    });

    it('keeps a zero charge as zero rather than omitting the metric', () => {
        const costs = { data: [bucket([usagePrice(RECORDS_PROD, '0.00')])] };

        expect(fromOrbPeriodCosts(costs, NOW)?.metrics).toEqual({ records: 0 });
    });

    it('omits a metric the subscription carries no price for', () => {
        // Real state: sync-record charges have been removed by hand for some accounts.
        const costs = { data: [bucket([usagePrice(WEBHOOKS_PROD, '2.00')])] };

        expect(fromOrbPeriodCosts(costs, NOW)?.metrics).not.toHaveProperty('records');
    });

    it('excludes fixed prices, so the metrics exclude the base fee', () => {
        const costs = {
            data: [
                bucket([
                    usagePrice(RECORDS_PROD, '23.17'),
                    { price_id: 'price_fixed', total: '500.00', price: { price_type: 'fixed_price', currency: 'USD', name: 'Base fee', billable_metric: null } }
                ])
            ]
        };

        expect(fromOrbPeriodCosts(costs, NOW)).toEqual({
            metrics: { records: 2317 },
            malformedMetrics: [],
            fullyAttributed: true,
            flagged: [],
            currency: 'USD'
        });
    });

    it('marks a price it cannot map as unattributed instead of dropping it silently', () => {
        const costs = { data: [bucket([usagePrice(RECORDS_PROD, '1.00'), usagePrice('unknown-metric-id', '7.50', 'Data transfer')])] };

        const result = fromOrbPeriodCosts(costs, NOW);
        expect(result?.metrics).toEqual({ records: 100 });
        expect(result?.fullyAttributed).toBe(false);
        expect(result?.flagged).toEqual([{ priceId: 'price_1', priceName: 'Data transfer', metric: null, amountInCents: 750 }]);
    });

    it('stays fully attributed when an unmapped price carries no charge', () => {
        const costs = { data: [bucket([usagePrice('unknown-metric-id', '0.00')])] };

        // Still unattributed — a $0 unmapped price is not the same as no unmapped price at all.
        expect(fromOrbPeriodCosts(costs, NOW)?.fullyAttributed).toBe(false);
    });

    it('sums several prices on the same metric', () => {
        const costs = { data: [bucket([usagePrice(RECORDS_PROD, '1.00'), usagePrice(RECORDS_PROD, '2.50')])] };

        expect(fromOrbPeriodCosts(costs, NOW)?.metrics).toEqual({ records: 350 });
    });

    it('reads the bucket that ends last, not the one listed last', () => {
        const costs = {
            data: [
                bucket([usagePrice(RECORDS_PROD, '99.00')], '2026-09-01T00:00:00+00:00'),
                bucket([usagePrice(RECORDS_PROD, '1.00')], '2026-08-02T00:00:00+00:00')
            ]
        };

        expect(fromOrbPeriodCosts(costs, NOW)?.metrics).toEqual({ records: 9900 });
    });

    it('returns null for a period that has already closed', () => {
        const costs = { data: [bucket([usagePrice(RECORDS_PROD, '40.00')], '2026-08-17T00:00:00+00:00')] };

        expect(fromOrbPeriodCosts(costs, NOW)).toBeNull();
    });

    it('returns null rather than reading a malformed timeframe_end as current', () => {
        // NaN <= now.getTime() is always false, so an unguarded comparison would treat this as open.
        const costs = { data: [bucket([usagePrice(RECORDS_PROD, '40.00')], 'not-a-date')] };

        expect(fromOrbPeriodCosts(costs, NOW)).toBeNull();
    });

    it('returns null when there are no cost buckets', () => {
        expect(fromOrbPeriodCosts({ data: [] }, NOW)).toBeNull();
    });

    it('scopes a malformed price to its own metric, leaving every other metric untouched', () => {
        const costs = { data: [bucket([usagePrice(RECORDS_PROD, 'n/a'), usagePrice(WEBHOOKS_PROD, '2.24')])] };

        const result = fromOrbPeriodCosts(costs, NOW);
        expect(result?.metrics).toEqual({ webhook_forwards: 224 });
        expect(result?.malformedMetrics).toEqual(['records']);
        // Its metric is known, so no other row is thrown into doubt.
        expect(result?.fullyAttributed).toBe(true);
    });

    it('scopes a currency-mismatched price to its own metric the same way', () => {
        const costs = { data: [bucket([usagePrice(RECORDS_PROD, '1.00')])] };
        costs.data[0]!.per_price_costs.push({
            price_id: 'price_2',
            total: '1.00',
            price: { price_type: 'usage_price', currency: 'EUR', name: 'Proxy requests', billable_metric: { id: WEBHOOKS_PROD } }
        });

        const result = fromOrbPeriodCosts(costs, NOW);
        expect(result?.metrics).toEqual({ records: 100 });
        expect(result?.malformedMetrics).toEqual(['webhook_forwards']);
        expect(result?.currency).toBe('USD');
    });

    it('scopes a credit-denominated price to its own metric — Orb behaving as designed, not bad data', () => {
        const costs = { data: [bucket([usagePrice(RECORDS_PROD, '1.00'), usagePrice(WEBHOOKS_PROD, '2.00')])] };
        costs.data[0]!.per_price_costs[1]!.price.currency = 'credits';

        const result = fromOrbPeriodCosts(costs, NOW);
        expect(result?.metrics).toEqual({ records: 100 });
        expect(result?.malformedMetrics).toEqual(['webhook_forwards']);
    });

    it('cannot pin down which unpriced metric a price with no known metric and no readable amount belongs to', () => {
        // Worst case: neither the metric nor the amount is known, so no metric-specific dash is possible —
        // fullyAttributed still covers it, same as any other unattributed price.
        const costs = { data: [bucket([usagePrice(RECORDS_PROD, '1.00'), usagePrice('unknown-metric-id', 'n/a')])] };

        const result = fromOrbPeriodCosts(costs, NOW);
        expect(result?.metrics).toEqual({ records: 100 });
        expect(result?.malformedMetrics).toEqual([]);
        expect(result?.fullyAttributed).toBe(false);
    });

    it('returns null when every price is fixed, so no currency can be stated', () => {
        const costs = {
            data: [
                bucket([
                    { price_id: 'price_fixed', total: '500.00', price: { price_type: 'fixed_price', currency: 'USD', name: 'Base fee', billable_metric: null } }
                ])
            ]
        };

        expect(fromOrbPeriodCosts(costs, NOW)).toBeNull();
    });

    it('truncates a sub-cent charge to zero', () => {
        // Per-unit rates run to 1e-7, so this is the ordinary state on a low-usage account.
        const costs = { data: [bucket([usagePrice(RECORDS_PROD, '0.004')])] };

        expect(fromOrbPeriodCosts(costs, NOW)?.metrics).toEqual({ records: 0 });
    });
});
