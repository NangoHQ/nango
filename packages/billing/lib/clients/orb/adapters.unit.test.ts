import { describe, expect, it, vi } from 'vitest';

import { fromOrbAddress, fromOrbCustomer, orbMetricToUsageMetric, toOrbEvent, toOrbPutCustomerPayload } from './adapters.js';

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
});

// ─── toOrbPutCustomerPayload ──────────────────────────────────────────────────

describe('toOrbPutCustomerPayload', () => {
    const base: BillingInvoicingDetails = {
        legalEntityName: 'Acme Corp',
        email: 'billing@acme.com',
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
        billing_address: null,
        tax_id: null
    } as unknown as Orb.Customer;

    it('maps id, portalUrl and invoicingDetails', () => {
        const result = fromOrbCustomer(orbCustomer);
        expect(result.id).toBe('orb_123');
        expect(result.portalUrl).toBe('https://portal.example.com');
        expect(result.invoicingDetails.legalEntityName).toBe('Acme Corp');
        expect(result.invoicingDetails.email).toBe('billing@acme.com');
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
