import type { NangoAction, ProxyConfiguration, InvoiceActionResponse, Invoice, FailedInvoice, ActionErrorResponse } from '../../models';
import { getTenantId } from '../helpers/get-tenant-id.js';
import { toInvoice } from '../mappers/to-invoice.js';

export default async function runAction(nango: NangoAction, input: Invoice[]): Promise<InvoiceActionResponse> {
    const tenant_id = await getTenantId(nango);

    // Validate the invoices:

    // 1) Invoice id is required
    const invalidInvoices = input.filter((x: any) => !x.id);
    if (invalidInvoices.length > 0) {
        throw new nango.ActionError<ActionErrorResponse>({
            message: `The invoice id is required to update the invoice.\nInvalid invoices:\n${JSON.stringify(invalidInvoices, null, 4)}`
        });
    }

    const config: ProxyConfiguration = {
        endpoint: 'api.xro/2.0/Invoices',
        headers: {
            'xero-tenant-id': tenant_id
        },
        params: {
            summarizeErrors: 'false'
        },
        data: {
            Invoices: input.map(mapInvoiceToXero)
        }
    };

    const res = await nango.post(config);
    const invoices = res.data.Invoices;

    const failedInvoices = invoices.filter((x: any) => x.HasErrors);
    if (failedInvoices.length > 0) {
        await nango.log(
            `Some invoices could not be created in Xero due to validation errors. Note that the remaining invoices (${
                input.length - failedInvoices.length
            }) were created successfully. Affected invoices:\n${JSON.stringify(failedInvoices, null, 4)}`,
            { level: 'error' }
        );
    }
    const succeededInvoices = invoices.filter((x: any) => !x.HasErrors);

    const response = {
        succeededInvoices: succeededInvoices.map(toInvoice),
        failedInvoices: failedInvoices.map(mapFailedXeroInvoice)
    } as InvoiceActionResponse;

    return response;
}

function mapInvoiceToXero(invoice: Invoice) {
    const xeroInvoice: Record<string, any> = {
        InvoiceID: invoice.id,
        Type: invoice.type,
        Contact: {
            ContactID: invoice.external_contact_id
        },
        LineItems: []
    };

    if (invoice.number) {
        xeroInvoice['InvoiceNumber'] = invoice.number;
    }

    if (invoice.status) {
        xeroInvoice['Status'] = invoice.status;
    }

    if (invoice.currency) {
        xeroInvoice['CurrencyCode'] = invoice.currency;
    }

    if (invoice.issuing_date) {
        const issuingDate = new Date(invoice.issuing_date);
        xeroInvoice['Date'] = issuingDate.toISOString().split('T')[0];
    }

    if (invoice.payment_due_date) {
        const dueDate = new Date(invoice.payment_due_date);
        xeroInvoice['DueDate'] = dueDate.toISOString().split('T')[0];
    }

    for (const item of invoice.fees) {
        const xeroItem: Record<string, any> = {
            LineItemID: item.item_id ? item.item_id : '',
            Description: item.description,
            AccountCode: item.account_code
        };

        if (item.item_code) {
            xeroItem['ItemCode'] = item.item_code;
        }

        if (item.units) {
            xeroItem['Quantity'] = item.units;
        }

        if (item.precise_unit_amount) {
            xeroItem['UnitAmount'] = item.precise_unit_amount;
        }

        if (item.amount_cents) {
            xeroItem['LineAmount'] = item.amount_cents / 100;
        }

        if (item.taxes_amount_cents) {
            xeroItem['TaxAmount'] = item.taxes_amount_cents / 100;
        }

        xeroInvoice['LineItems'].push(xeroItem);
    }

    return xeroInvoice;
}

function mapFailedXeroInvoice(xeroInvoice: any): FailedInvoice {
    const failedInvoice = toInvoice(xeroInvoice) as FailedInvoice;
    failedInvoice.validation_errors = xeroInvoice.ValidationErrors;
    return failedInvoice;
}
