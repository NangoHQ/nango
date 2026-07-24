import type { InvoicingFormData } from './InvoicingDetailsForm.js';
import type { BillingCustomer } from '@nangohq/types';

export function toFormData(customer: BillingCustomer): InvoicingFormData {
    return {
        legalEntityName: customer.invoicingDetails.legalEntityName,
        // Defensive: `additionalEmails` is typed as required, but a client can still hit an
        // API version that predates the field (e.g. this webapp build outrunning the backend
        // deploy), so a real response can omit it despite the type's guarantee.
        emails: [customer.invoicingDetails.email, ...(customer.invoicingDetails.additionalEmails ?? [])],
        emailsDraft: '',
        address: customer.invoicingDetails.address ? { ...customer.invoicingDetails.address, country: customer.invoicingDetails.address.country ?? '' } : null,
        taxId: customer.invoicingDetails.taxId
    };
}
