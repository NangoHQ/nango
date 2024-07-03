import type { NangoAction, InvoiceActionResponse, Invoice, FailedInvoice, InvoiceFee, ActionErrorResponse } from '../../models';

async function getTenantId(nango: NangoAction) {
    const tenants = await nango.get({
        endpoint: 'connections'
    });
    return tenants.data[0]['tenantId'];
}

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

    const config = {
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
        succeededInvoices: succeededInvoices.map(mapXeroInvoice),
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
    const failedInvoice = mapXeroInvoice(xeroInvoice) as FailedInvoice;
    failedInvoice.validation_errors = xeroInvoice.ValidationErrors;
    return failedInvoice;
}

function mapXeroInvoice(xeroInvoice: any): Invoice {
    return {
        id: xeroInvoice.InvoiceID,
        type: xeroInvoice.Type,
        external_contact_id: xeroInvoice.Contact.ContactID,
        status: xeroInvoice.Status,
        issuing_date: xeroInvoice.Date ? parseDate(xeroInvoice.Date) : null,
        payment_due_date: xeroInvoice.DueDate ? parseDate(xeroInvoice.DueDate) : null,
        number: xeroInvoice.InvoiceNumber,
        currency: xeroInvoice.CurrencyCode,
        purchase_order: null,
        fees: xeroInvoice.LineItems.map(mapXeroInvoiceItem)
    } as Invoice;
}

function mapXeroInvoiceItem(xeroInvoiceItem: any): InvoiceFee {
    return {
        item_id: xeroInvoiceItem.LineItemID,
        item_code: xeroInvoiceItem.ItemCode,
        description: xeroInvoiceItem.Description,
        units: xeroInvoiceItem.Quantity,
        precise_unit_amount: xeroInvoiceItem.UnitAmount,
        account_code: xeroInvoiceItem.AccountCode,
        account_external_id: xeroInvoiceItem.AccountId,
        amount_cents: parseFloat(xeroInvoiceItem.LineAmount) * 100, // Amounts in xero are not in cents
        taxes_amount_cents: parseFloat(xeroInvoiceItem.TaxAmount) * 100 // Amounts in xero are not in cents
    } as InvoiceFee;
}

// Discards the timeZone data and assumes all dates returned are in UTC
function parseDate(xeroDateString: string): Date {
    const match = xeroDateString.match(/\/Date\((\d+)([+-]\d{4})\)\//);
    if (match) {
        const timestamp = parseInt(match[1] as string, 10);

        // Create a new date object with the timestamp
        const date = new Date(timestamp);
        return date;
    }
    throw new Error(`Cannot parse date from Xero API with parseDate function, input was: ${xeroDateString}`);
}
