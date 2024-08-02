import type { NangoAction, ExactInvoiceCreateOutput, ExactInvoiceCreateInput } from '../../models';
import type { ResponsePostBody, E0_SalesInvoice, EO_SalesInvoiceLine } from '../types';
import { getUser } from '../helpers/get-user.js';
import { exactInvoiceCreateInputSchema } from '../../schema.zod.js';

export default async function runAction(nango: NangoAction, input: ExactInvoiceCreateInput): Promise<ExactInvoiceCreateOutput> {
    const parsedInput = exactInvoiceCreateInputSchema.safeParse(input);
    if (!parsedInput.success) {
        throw new nango.ActionError({
            message: 'Invalid input',
            errors: parsedInput.error
        });
    }

    const { division } = await getUser(nango);

    const body: Omit<Partial<E0_SalesInvoice>, 'SalesInvoiceLines'> & {
        SalesInvoiceLines: Partial<EO_SalesInvoiceLine>[];
    } = {
        OrderedBy: input.customerId,
        Journal: input.journal || 70, // https://support.exactonline.com/community/s/knowledge-base#All-All-DNO-Content-business-example-api-sales-invoice
        Currency: input.currency || 'EUR',
        Description: input.description || '',
        OrderDate: input.createdAt ? input.createdAt.toISOString() : new Date().toISOString(),
        SalesInvoiceLines: input.lines.map((line) => {
            return {
                Item: line.itemId,
                Quantity: line.quantity,
                NetPrice: line.amountNet,
                VATCode: line.vatCode || '',
                Description: line.description || ''
            };
        })
    };

    const create = await nango.post<ResponsePostBody<E0_SalesInvoice>>({
        endpoint: `/api/v1/${division}/salesinvoice/SalesInvoices`,
        data: body
    });

    return {
        id: create.data.d.InvoiceID
    };
}
