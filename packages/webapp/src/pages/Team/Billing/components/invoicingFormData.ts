import type { InvoicingFormData } from './InvoicingDetailsForm.js';
import type { BillingCustomer } from '@nangohq/types';

export function toFormData(customer: BillingCustomer): InvoicingFormData {
    return {
        legalEntityName: customer.invoicingDetails.legalEntityName,
        // additionalEmails is typed as required, but a real response can still omit it.
        emails: [customer.invoicingDetails.email, ...(customer.invoicingDetails.additionalEmails ?? [])],
        emailsDraft: '',
        address: customer.invoicingDetails.address ? { ...customer.invoicingDetails.address, country: customer.invoicingDetails.address.country ?? '' } : null,
        taxId: customer.invoicingDetails.taxId
    };
}
