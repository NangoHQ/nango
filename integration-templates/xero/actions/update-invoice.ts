import type { NangoAction, ProxyConfiguration, InvoiceActionResponse, UpdateInvoice, FailedInvoice, ActionErrorResponse } from '../../models';
import { getTenantId } from '../helpers/get-tenant-id.js';
import { toInvoice, toXeroInvoice } from '../mappers/to-invoice.js';

export default async function runAction(nango: NangoAction, input: UpdateInvoice[]): Promise<InvoiceActionResponse> {
    const tenant_id = await getTenantId(nango);

    // Validate the invoices:
    if (!input || !input.length) {
        throw new nango.ActionError<ActionErrorResponse>({
            message: `You must pass an array of invoices! Received: ${JSON.stringify(input)}`
        });
    }

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
