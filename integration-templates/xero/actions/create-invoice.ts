import type { NangoAction, CreateInvoice, InvoiceActionResponse, FailedInvoice, ActionErrorResponse } from '../../models';
import { getTenantId } from '../helpers/get-tenant-id.js';
import { toInvoice, toXeroInvoice } from '../mappers/to-invoice.js';

export default async function runAction(nango: NangoAction, input: CreateInvoice[]): Promise<InvoiceActionResponse> {
    const tenant_id = await getTenantId(nango);

    // Validate the invoices:
    if (!input || !input.length) {
        throw new nango.ActionError<ActionErrorResponse>({
            message: `You must pass an array of invoices! Received: ${JSON.stringify(input)}`
        });
    }

    // 1) Contact is required
    const invalidInvoices = input.filter((x: any) => !x.external_contact_id || x.fees.length === 0);
    if (invalidInvoices.length > 0) {
        throw new nango.ActionError<ActionErrorResponse>({
            message: `A contact id and at least one invoice item is required for every invoice.\nInvalid invoices:\n${JSON.stringify(invalidInvoices, null, 4)}`
        });
    }

    // 2) 1+ valid invoice item is required
    for (const invoice of input) {
        const invalidInvoiceItems = invoice.fees.filter((x: any) => !x.description || x.description.length < 1);
        if (invalidInvoiceItems.length > 0) {
            throw new nango.ActionError<ActionErrorResponse>({
                message: `Every invoice item needs at least a description with 1 character.\n
                    Invalid items:\n${JSON.stringify(invalidInvoiceItems, null, 4)}\n
                    Invoice: ${JSON.stringify(invoice, null, 4)}`
            });
        }
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
            Invoices: input.map(toXeroInvoice)
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

    const response: InvoiceActionResponse = {
        succeededInvoices: succeededInvoices.map(toInvoice),
        failedInvoices: failedInvoices.map(mapFailedXeroInvoice)
    };

    return response;
}

function mapFailedXeroInvoice(xeroInvoice: any): FailedInvoice {
    const failedInvoice = toInvoice(xeroInvoice) as FailedInvoice;
    failedInvoice.validation_errors = xeroInvoice.ValidationErrors;
    return failedInvoice;
}
