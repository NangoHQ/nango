import type { NangoAction, NetsuiteInvoiceCreateInput, NetsuiteInvoiceCreateOutput } from '../../models';
import type { NS_Invoice } from '../types';
import { netsuiteInvoiceCreateInputSchema } from '../schema.zod.js';

export default async function runAction(nango: NangoAction, input: NetsuiteInvoiceCreateInput): Promise<NetsuiteInvoiceCreateOutput> {
    const parsedInput = netsuiteInvoiceCreateInputSchema.safeParse(input);
    if (!parsedInput.success) {
        throw new nango.ActionError({
            message: 'invalid invoice input',
            errors: parsedInput.error
        });
    }

    const body: Partial<NS_Invoice> = {
        entity: { id: input.customerId },
        status: { id: input.status },
        ...(input.currency && { currency: { refName: input.currency } }),
        ...(input.description && { memo: input.description }),
        item: {
            items: input.lines.map((line) => ({
                item: { id: line.itemId, refName: line.description || '' },
                quantity: line.quantity,
                amount: line.amount,
                ...(line.vatCode && { taxDetailsReference: line.vatCode })
            }))
        }
    };
    const res = await nango.post({
        endpoint: '/invoice',
        data: body
    });
    const id = res.headers.location?.split('/').pop();
    if (!id) {
        throw new nango.ActionError({
            message: "Error creating invoice: could not parse 'id' from Netsuite API response"
        });
    }
    return { id };
}
