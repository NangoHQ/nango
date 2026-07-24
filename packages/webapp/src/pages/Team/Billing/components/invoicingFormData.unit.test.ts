import { describe, expect, it } from 'vitest';

import { toFormData } from './invoicingFormData.js';

import type { BillingCustomer } from '@nangohq/types';

function customerWith(invoicingDetails: Partial<BillingCustomer['invoicingDetails']>): BillingCustomer {
    return {
        id: 'orb_cust_123',
        portalUrl: null,
        invoicingDetails: {
            legalEntityName: 'Acme Corp',
            email: 'billing@acme.com',
            additionalEmails: [],
            address: null,
            taxId: null,
            ...invoicingDetails
        }
    };
}

describe('toFormData', () => {
    it('includes the primary email followed by the additional ones', () => {
        const form = toFormData(customerWith({ email: 'billing@acme.com', additionalEmails: ['ap@acme.com', 'finance@acme.com'] }));
        expect(form.emails).toEqual(['billing@acme.com', 'ap@acme.com', 'finance@acme.com']);
    });

    it('falls back to just the primary email when additionalEmails is missing from the response', () => {
        // A real client can hit an API version that predates the additionalEmails field
        // (e.g. this webapp build outrunning the backend deploy) despite the type's guarantee.
        const customer = customerWith({ email: 'billing@acme.com' });
        // @ts-expect-error simulating a response shape older than the current type
        delete customer.invoicingDetails.additionalEmails;

        expect(toFormData(customer).emails).toEqual(['billing@acme.com']);
    });
});
